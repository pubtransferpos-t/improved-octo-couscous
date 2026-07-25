import { useEffect, useRef, useState, useCallback } from 'react';
import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import { EFFECTS, EffectType, GambitState, generateId, getPieces } from './gambit-engine';

export interface GameSettings {
  mode: 'bot' | 'pass-and-play' | 'custom' | 'online';
  spinInterval: number;
  botElo: number;
  playerColor: 'w' | 'b' | 'random';
  enabledEffects: EffectType[];
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'bot',
  spinInterval: 5,
  botElo: 1200,
  playerColor: 'w',
  enabledEffects: Object.keys(EFFECTS) as EffectType[],
};

export interface OnlineMatch {
  status: 'checking' | 'waiting' | 'matched' | 'error';
  ticket?: string;
  roomId?: string;
  color?: Color;
  playersOnline: number;
  message: string;
}

const WORKER_PROXY = '/api/worker-proxy';

/** Shape of the room state returned by every Worker endpoint. */
interface ServerRoom {
  fen: string;
  moveCount: number;
  status: string;
  turn: 'white' | 'black';
  spinEligibility: { white: number; black: number };
}

/** Derive client-side spin progress from authoritative server state. */
function serverProgress(room: ServerRoom): { w: number; b: number } {
  return {
    w: Math.max(0, room.spinEligibility.white - room.moveCount),
    b: Math.max(0, room.spinEligibility.black - room.moveCount),
  };
}

export function useOnlineMatch(settings: GameSettings): OnlineMatch {
  const [match, setMatch] = useState<OnlineMatch>({
    status: settings.mode === 'online' ? 'checking' : 'matched',
    playersOnline: 0,
    message: settings.mode === 'online' ? 'Connecting to matchmaking…' : '',
  });

  useEffect(() => {
    if (settings.mode !== 'online') return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let ticket: string | undefined;

    const poll = async () => {
      if (cancelled || !ticket) return;
      try {
        const response = await fetch(`${WORKER_PROXY}/matchmaking/status?ticket=${encodeURIComponent(ticket)}`);
        const data = await response.json() as Partial<OnlineMatch> & { error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Matchmaking ticket expired');
        if (cancelled) return;
        setMatch({
          status: data.status === 'matched' ? 'matched' : 'waiting',
          ticket,
          roomId: data.roomId,
          color: normalizeOnlineColor(data.color),
          playersOnline: data.playersOnline ?? 1,
          message: data.message ?? 'Waiting for an opponent…',
        });
        if (data.status !== 'matched') pollTimer = setTimeout(poll, 2000);
      } catch (error) {
        if (!cancelled) {
          setMatch({
            status: 'error',
            playersOnline: 0,
            message: error instanceof Error ? error.message : 'Could not reach matchmaking',
          });
        }
      }
    };

    fetch(`${WORKER_PROXY}/matchmaking/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spinInterval: settings.spinInterval }),
    })
      .then(async response => {
        const data = await response.json() as Partial<OnlineMatch> & { error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Could not join matchmaking');
        ticket = data.ticket;
        if (!cancelled) {
          setMatch({
            status: data.status === 'matched' ? 'matched' : 'waiting',
            ticket,
            roomId: data.roomId,
            color: normalizeOnlineColor(data.color),
            playersOnline: data.playersOnline ?? 1,
            message: data.message ?? 'Waiting for an opponent…',
          });
        }
        if (data.status !== 'matched') poll();
      })
      .catch(error => {
        if (!cancelled) {
          setMatch({
            status: 'error',
            playersOnline: 0,
            message: error instanceof Error ? error.message : 'Could not reach matchmaking',
          });
        }
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (ticket) {
        void fetch(`${WORKER_PROXY}/matchmaking/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [settings.mode, settings.spinInterval]);

  return match;
}

const FORCE_SYNC_COOLDOWN_S = 10;

export function useGambitGame(settings: GameSettings, onlineMatch?: OnlineMatch) {
  const chessRef = useRef(new Chess());
  const [state, setState] = useState<GambitState>({
    fen: chessRef.current.fen(),
    turn: 'w',
    spinProgress: { w: settings.spinInterval, b: settings.spinInterval },
    activeEffects: { w: [], b: [] },
    capturedPieces: [],
    history: [chessRef.current.fen()],
  });

  const [pendingSpin, setPendingSpin] = useState<Color | null>(null);
  const [gameOver, setGameOver] = useState<{ isOver: boolean; result: string | null }>({ isOver: false, result: null });
  const [effectTargeting, setEffectTargeting] = useState<{ effect: EffectType; by: Color; step: number; selected: Square[] } | null>(null);

  // ── Online sync infrastructure ─────────────────────────────────────────────
  const onlineRoomRef = useRef<string | null>(null);
  /** Exposed so makeMove can trigger an immediate re-sync after posting. */
  const onlineSyncRef = useRef<(() => void) | null>(null);
  /**
   * Tracks the last server-reported spinProgress so we can detect the
   * transition from > 0 → ≤ 0 and fire setPendingSpin exactly once,
   * without calling it inside a setState callback (which React may call
   * twice in strict mode).
   */
  const lastServerProgress = useRef<{ w: number; b: number } | null>(null);

  // ── Force-sync (Problem button) ────────────────────────────────────────────
  const [syncCooldown, setSyncCooldown] = useState(0);
  const lastSyncPressRef = useRef(0);

  // Tick the cooldown counter down every second while active.
  useEffect(() => {
    if (syncCooldown <= 0) return;
    const t = setTimeout(() => setSyncCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [syncCooldown]);

  const forceSync = useCallback(() => {
    const elapsed = (Date.now() - lastSyncPressRef.current) / 1000;
    if (elapsed < FORCE_SYNC_COOLDOWN_S) return; // still cooling down
    lastSyncPressRef.current = Date.now();
    setSyncCooldown(FORCE_SYNC_COOLDOWN_S);
    onlineSyncRef.current?.();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const checkGameOver = useCallback((c: Chess) => {
    if (c.isCheckmate()) return { isOver: true, result: `${c.turn() === 'w' ? 'Black' : 'White'} won by checkmate` };
    if (c.isStalemate()) return { isOver: true, result: 'Draw by stalemate' };
    if (c.isDraw()) return { isOver: true, result: 'Draw' };
    return { isOver: false, result: null };
  }, []);

  const updateState = useCallback(() => {
    const c = chessRef.current;
    setState(s => ({
      ...s,
      fen: c.fen(),
      turn: c.turn(),
    }));
    setGameOver(checkGameOver(c));
  }, [checkGameOver]);

  /**
   * Apply authoritative server room state to local React state.
   * Also handles spin-wheel trigger detection.
   */
  const applyServerRoom = useCallback((room: ServerRoom, myColor: Color | undefined) => {
    const progress = serverProgress(room);

    // Detect spin eligibility transition: was > 0, now ≤ 0 → trigger wheel.
    if (myColor) {
      const prev = lastServerProgress.current;
      if (progress[myColor] <= 0 && (!prev || prev[myColor] > 0)) {
        setPendingSpin(myColor);
      }
    }
    lastServerProgress.current = progress;

    chessRef.current.load(room.fen);
    setState(s => ({
      ...s,
      fen: room.fen,
      turn: chessRef.current.turn(),
      spinProgress: progress,
    }));
    setGameOver(checkGameOver(chessRef.current));
  }, [checkGameOver]);

  const tickEffects = useCallback((color: Color) => {
    setState(s => {
      const newEffects = { ...s.activeEffects };
      newEffects[color] = newEffects[color].map(e => ({ ...e, duration: e.duration - 1 })).filter(e => e.duration > 0);
      return { ...s, activeEffects: newEffects };
    });
  }, []);

  // ── Legal move filtering ────────────────────────────────────────────────────
  const getLegalMoves = useCallback((square?: Square) => {
    const c = chessRef.current;
    const turn = c.turn();
    const opp = turn === 'w' ? 'b' : 'w';
    
    const forcePawnEffect = state.activeEffects[turn].find(e => e.type === 'force_pawn');
    let moves = c.moves({ square, verbose: true }) as Move[];

    if (forcePawnEffect) {
      const pawnMoves = moves.filter(m => m.piece === 'p');
      if (pawnMoves.length > 0) moves = pawnMoves;
    }

    const frozenSquares = state.activeEffects[turn].filter(e => e.type === 'freeze_piece').flatMap(e => e.targetSquares);
    moves = moves.filter(m => !frozenSquares.includes(m.from as Square));

    const queenDowngrade = state.activeEffects[turn].find(e => e.type === 'downgrade_queen');
    if (queenDowngrade) {
      moves = moves.filter(m => {
        if (m.piece !== 'q') return true;
        const fromFile = m.from[0];
        const fromRank = m.from[1];
        const toFile = m.to[0];
        const toRank = m.to[1];
        return fromFile === toFile || fromRank === toRank;
      });
    }

    const shieldedSquares = state.activeEffects[opp].filter(e => e.type === 'shield_piece').flatMap(e => e.targetSquares);
    moves = moves.filter(m => {
      if (m.flags.includes('c') || m.flags.includes('e')) {
        if (shieldedSquares.includes(m.to as Square)) return false;
      }
      return true;
    });

    return moves;
  }, [state.activeEffects]);

  // ── makeMove ────────────────────────────────────────────────────────────────
  const makeMove = useCallback((move: { from: string, to: string, promotion?: string }) => {
    const moves = getLegalMoves(move.from as Square);
    const validMove = moves.find(m => m.to === move.to && (!move.promotion || m.promotion === move.promotion));
    
    if (!validMove) return false;

    const c = chessRef.current;
    const turn = c.turn();
    const moveRes = c.move(validMove);
    
    if (moveRes) {
      let captured: { type: PieceSymbol; color: Color } | null = null;
      if (moveRes.captured) {
        captured = { type: moveRes.captured, color: turn === 'w' ? 'b' : 'w' };
      }
      
      setState(s => {
        const nextTurn = c.turn();

        // In online mode, spinProgress is driven entirely by the server.
        // We do NOT decrement it locally — the POST /move response or the
        // periodic sync will apply the authoritative values.
        let newProgress = { ...s.spinProgress };
        if (settings.mode !== 'online') {
          newProgress[turn] -= 1;
          if (newProgress[turn] <= 0) {
            setPendingSpin(turn);
            newProgress[turn] = settings.spinInterval;
          }
        }

        const newCaptured = captured ? [...s.capturedPieces, captured] : s.capturedPieces;

        const skipTurnEffect = s.activeEffects[nextTurn].find(e => e.type === 'skip_turn');
        let finalFen = c.fen();
        let effects = { ...s.activeEffects };

        if (skipTurnEffect) {
          effects[nextTurn] = effects[nextTurn].filter(e => e.id !== skipTurnEffect.id);
          const tokens = c.fen().split(' ');
          tokens[1] = turn;
          tokens[3] = '-';
          c.load(tokens.join(' '));
          finalFen = c.fen();
        }

        return {
          ...s,
          fen: finalFen,
          turn: c.turn(),
          spinProgress: newProgress,
          capturedPieces: newCaptured,
          history: [...s.history, finalFen],
          activeEffects: effects
        };
      });
      setGameOver(checkGameOver(c));

      if (settings.mode === 'online' && onlineMatch?.roomId && onlineMatch.color) {
        const myColor = onlineMatch.color;
        const roomId = onlineMatch.roomId;
        const result = checkGameOver(c);

        void fetch(`${WORKER_PROXY}/rooms/${roomId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            move,
            color: myColor === 'w' ? 'white' : 'black',
            resultFen: c.fen(),
            algebraic: moveRes.san,
            captured: moveRes.captured,
            status: result.isOver
              ? result.result?.includes('checkmate') ? 'checkmate' : 'draw'
              : 'playing',
          }),
        })
          .then(async res => {
            if (!res.ok) {
              // Server rejected or had an error — force a GET sync to correct drift
              onlineSyncRef.current?.();
              return;
            }
            // Use the server's authoritative response body directly.
            // This is faster than a follow-up GET and ensures the mover's
            // screen immediately snaps to the server's view of the position.
            const room = await res.json() as ServerRoom;
            applyServerRoom(room, myColor);
          })
          .catch(() => onlineSyncRef.current?.());
      }
      
      if (c.turn() !== turn) {
        tickEffects(c.turn());
      }
      
      return true;
    }
    return false;
  }, [getLegalMoves, settings.mode, settings.spinInterval, tickEffects, checkGameOver, onlineMatch, applyServerRoom]);

  // ── Online room poll ────────────────────────────────────────────────────────
  // Polls every 2 seconds so each client sees moves made by the opponent.
  useEffect(() => {
    if (settings.mode !== 'online' || onlineMatch?.status !== 'matched' || !onlineMatch.roomId) return;
    const roomId = onlineMatch.roomId;
    onlineRoomRef.current = roomId;
    let cancelled = false;

    const myColor = onlineMatch?.color;

    const sync = async () => {
      try {
        const response = await fetch(`${WORKER_PROXY}/rooms/${roomId}/state`);
        if (!response.ok || cancelled) return;
        const remote = await response.json() as ServerRoom;
        if (cancelled) return;

        const progress = serverProgress(remote);

        // Trigger spin wheel when server-reported progress transitions to ≤ 0.
        // Using a ref avoids calling setState inside setState and prevents
        // duplicate triggers on React strict-mode double invocations.
        if (myColor) {
          const prev = lastServerProgress.current;
          if (progress[myColor] <= 0 && (!prev || prev[myColor] > 0)) {
            setPendingSpin(myColor);
          }
        }
        lastServerProgress.current = progress;

        if (remote.fen === chessRef.current.fen()) {
          // Board position matches — only refresh spin counters.
          setState(s => ({ ...s, spinProgress: progress }));
          return;
        }

        // New position from opponent's move — apply fully.
        chessRef.current.load(remote.fen);
        setState(s => ({
          ...s,
          fen: remote.fen,
          turn: chessRef.current.turn(),
          spinProgress: progress,
        }));
        setGameOver(checkGameOver(chessRef.current));
      } catch {
        // Transient network error — next poll will retry.
      }
    };

    onlineSyncRef.current = sync;
    void sync();
    const interval = setInterval(sync, 2000);
    return () => {
      cancelled = true;
      onlineSyncRef.current = null;
      clearInterval(interval);
      if (onlineRoomRef.current === roomId) onlineRoomRef.current = null;
    };
  }, [settings.mode, onlineMatch?.roomId, onlineMatch?.status, onlineMatch?.color, checkGameOver]);

  // ── applyEffect ─────────────────────────────────────────────────────────────
  const applyEffect = useCallback((effectType: EffectType, by: Color, targets: Square[] = [], revivedPiece?: PieceSymbol) => {
    const def = EFFECTS[effectType];
    const targetColor = def.category === 'buff' ? by : (by === 'w' ? 'b' : 'w');
    const c = chessRef.current;

    // Check ward
    if (def.category === 'nerf') {
      const wardIdx = state.activeEffects[targetColor].findIndex(e => e.type === 'block_nerf');
      if (wardIdx >= 0) {
        setState(s => {
          const newEffects = { ...s.activeEffects };
          newEffects[targetColor] = newEffects[targetColor].filter((_, i) => i !== wardIdx);
          return { ...s, activeEffects: newEffects };
        });
        return;
      }
    }

    if (def.duration > 0) {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [targetColor]: [...s.activeEffects[targetColor], {
            id: generateId(),
            type: effectType,
            duration: def.duration,
            targetSquares: targets
          }]
        }
      }));
    } else {
      if (effectType === 'extra_turn') {
        const tokens = c.fen().split(' ');
        tokens[1] = by;
        tokens[3] = '-';
        c.load(tokens.join(' '));
        updateState();
      }
      else if (effectType === 'undo_move') {
        if (state.history.length > 2) {
          const prevFen = state.history[state.history.length - 3];
          c.load(prevFen);
          setState(s => ({ ...s, history: s.history.slice(0, -2) }));
          updateState();
        }
      }
      else if (effectType === 'bonus_spin') {
        setPendingSpin(by);
      }
      else if (effectType === 'lose_pawn') {
        const pawns = getPieces(c, targetColor, 'p');
        if (pawns.length > 0) {
          const sq = pawns[Math.floor(Math.random() * pawns.length)];
          c.remove(sq);
          updateState();
        }
      }
      else if (effectType === 'delay_spin') {
        setState(s => {
          const np = { ...s.spinProgress };
          np[targetColor] += 5;
          return { ...s, spinProgress: np };
        });
      }
      else if (effectType === 'shuffle_pieces') {
        const pieces = getPieces(c, targetColor).filter(sq => c.get(sq)?.type !== 'k');
        if (pieces.length >= 2) {
          const p1 = pieces[Math.floor(Math.random() * pieces.length)];
          let p2 = pieces[Math.floor(Math.random() * pieces.length)];
          while (p2 === p1) p2 = pieces[Math.floor(Math.random() * pieces.length)];
          
          const piece1 = c.get(p1);
          const piece2 = c.get(p2);
          if (piece1 && piece2) {
            c.remove(p1); c.remove(p2);
            c.put(piece1, p2); c.put(piece2, p1);
            if (c.isCheck()) {
              c.remove(p1); c.remove(p2);
              c.put(piece1, p1); c.put(piece2, p2);
            }
          }
          updateState();
        }
      }
      else if (effectType === 'promote_pawn' && targets.length > 0) {
        c.put({ type: 'q', color: by }, targets[0]);
        updateState();
      }
      else if (effectType === 'swap_pieces' && targets.length === 2) {
        const p1 = c.get(targets[0]);
        const p2 = c.get(targets[1]);
        if (p1 && p2) {
          c.remove(targets[0]); c.remove(targets[1]);
          c.put(p1, targets[1]); c.put(p2, targets[0]);
          if (c.isCheck()) {
            c.remove(targets[0]); c.remove(targets[1]);
            c.put(p1, targets[0]); c.put(p2, targets[1]);
          }
          updateState();
        }
      }
      else if (effectType === 'revive_piece' && targets.length === 1 && revivedPiece) {
        c.put({ type: revivedPiece, color: by }, targets[0]);
        setState(s => {
          const cap = [...s.capturedPieces];
          const idx = cap.findIndex(p => p.color === by && p.type === revivedPiece);
          if (idx >= 0) cap.splice(idx, 1);
          return { ...s, capturedPieces: cap };
        });
        updateState();
      }
    }

    // ── Post effect to server in online mode ──────────────────────────────
    // Critical: the server must advance spinEligibility after every spin.
    // Without this POST, spinEligibility never moves forward and the player
    // gets the spin wheel on every single move ("spin every turn" bug).
    if (settings.mode === 'online' && onlineMatch?.roomId && onlineMatch.color) {
      const serverColor = onlineMatch.color === 'w' ? 'white' : 'black';
      const roomId = onlineMatch.roomId;

      void fetch(`${WORKER_PROXY}/rooms/${roomId}/effect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effect: { type: effectType },
          color: serverColor,
          // Send the post-effect FEN for board-changing effects so the
          // server stays in sync with position modifications.
          resultFen: chessRef.current.fen(),
          spinInterval: settings.spinInterval,
        }),
      })
        .then(async res => {
          if (!res.ok) return;
          const room = await res.json() as ServerRoom;
          // Apply the server's updated spinEligibility so both clients
          // now see the correct next-spin countdown.
          const progress = serverProgress(room);
          // Reset the spin-trigger ref so the next eligibility transition
          // is detected cleanly (the wheel was just consumed).
          lastServerProgress.current = progress;
          setState(s => ({ ...s, spinProgress: progress }));
        })
        .catch(() => onlineSyncRef.current?.());
    }
  }, [state, updateState, settings.mode, settings.spinInterval, onlineMatch]);

  const initiateEffect = useCallback((effectType: EffectType, by: Color) => {
    const def = EFFECTS[effectType];
    if (def.targetRule !== 'none') {
      setEffectTargeting({ effect: effectType, by, step: 0, selected: [] });
    } else {
      applyEffect(effectType, by);
    }
  }, [applyEffect]);

  const handleTargetClick = useCallback((square: Square) => {
    if (!effectTargeting) return;
    const { effect, by, selected } = effectTargeting;
    const def = EFFECTS[effect];
    const c = chessRef.current;
    const piece = c.get(square);

    const isValid = () => {
      switch (def.targetRule) {
        case 'own_piece': return piece && piece.color === by;
        case 'opponent_piece': return piece && piece.color !== by;
        case 'own_pawn': return piece && piece.color === by && piece.type === 'p';
        case 'empty_square': return !piece;
        case 'two_own_pieces': return piece && piece.color === by;
        default: return false;
      }
    };

    if (isValid()) {
      const newSelected = [...selected, square];
      if (def.targetRule === 'two_own_pieces' && newSelected.length < 2) {
        setEffectTargeting({ ...effectTargeting, step: 1, selected: newSelected });
      } else {
        let revived: PieceSymbol | undefined;
        if (effect === 'revive_piece') {
          const caps = state.capturedPieces.filter(p => p.color === by);
          if (caps.length === 0) {
            setEffectTargeting(null);
            return;
          }
          const vals: Record<PieceSymbol, number> = { q:9, r:5, b:3, n:3, p:1, k:0 };
          caps.sort((a,b) => vals[b.type] - vals[a.type]);
          revived = caps[0].type;
        }

        applyEffect(effect, by, newSelected, revived);
        setEffectTargeting(null);
      }
    }
  }, [effectTargeting, applyEffect, state.capturedPieces]);

  return {
    state,
    chess: chessRef.current,
    pendingSpin,
    setPendingSpin,
    gameOver,
    makeMove,
    getLegalMoves,
    initiateEffect,
    effectTargeting,
    setEffectTargeting,
    handleTargetClick,
    forceSync,
    syncCooldown,
  };
}

function normalizeOnlineColor(color: unknown): Color | undefined {
  if (color === 'white' || color === 'w') return 'w';
  if (color === 'black' || color === 'b') return 'b';
  return undefined;
}
