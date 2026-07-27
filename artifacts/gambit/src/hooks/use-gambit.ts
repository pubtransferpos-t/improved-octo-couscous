import { useEffect, useRef, useState, useCallback } from 'react';
import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import {
  EFFECTS, EffectType, GambitState, generateId, getPieces,
  adjacentSquares, squareDistance, getRandomDiagonal,
  PIECE_VALUES, randomPieceForValue, selectWeightedEffect,
  HeldAbility, HAND_SIZE_LIMIT,
} from './gambit-engine';

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

interface ServerActiveEffect {
  color: 'white' | 'black';
  type: string;
  turnsRemaining: number;
  params?: Record<string, unknown>;
}

interface ServerRoom {
  fen: string;
  moveCount: number;
  status: string;
  turn: 'white' | 'black';
  spinEligibility: { white: number; black: number };
  activeEffects?: ServerActiveEffect[];
  stockfishElo?: { white: number | null; black: number | null };
}

/** Effect types that the server tracks authoritatively (timed, sync'd on every poll). */
const SERVER_TRACKED_EFFECTS = new Set([
  'shield_piece', 'freeze_piece', 'downgrade_queen',
  'skip_turn', 'block_nerf', 'force_pawn', 'no_backward',
]);

/** Merge server-tracked active effects into client GambitState. */
function mergeServerEffects(
  clientEffects: GambitState['activeEffects'],
  serverEffects: ServerActiveEffect[] = [],
): GambitState['activeEffects'] {
  // Strip client-side copies of server-tracked effects (server is authoritative)
  const filtered: GambitState['activeEffects'] = {
    w: clientEffects.w.filter(e => !SERVER_TRACKED_EFFECTS.has(e.type)),
    b: clientEffects.b.filter(e => !SERVER_TRACKED_EFFECTS.has(e.type)),
  };
  // Re-add from server state
  for (const se of serverEffects) {
    if (!SERVER_TRACKED_EFFECTS.has(se.type)) continue;
    const clientColor: Color = se.color === 'white' ? 'w' : 'b';
    filtered[clientColor].push({
      id: `srv-${se.type}-${clientColor}`,
      type: se.type as EffectType,
      duration: se.turnsRemaining,
      targetSquares: [],
    });
  }
  return filtered;
}

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
          setMatch({ status: 'error', playersOnline: 0, message: error instanceof Error ? error.message : 'Could not reach matchmaking' });
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
        if (!cancelled) setMatch({ status: 'error', playersOnline: 0, message: error instanceof Error ? error.message : 'Could not reach matchmaking' });
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

function initGambitState(chess: Chess, settings: GameSettings): GambitState {
  return {
    fen: chess.fen(),
    turn: 'w',
    spinProgress: { w: settings.spinInterval, b: settings.spinInterval },
    permanentBonusSpins: { w: 0, b: 0 },
    activeEffects: { w: [], b: [] },
    capturedPieces: [],
    history: [chess.fen()],
    claimedSquares: { w: [], b: [] },
    heir: { w: null, b: null },
    royalReversal: { w: false, b: false },
    stockfishElo: { w: null, b: null },
    illegalMoveAvailable: { w: false, b: false },
    revoltedColor: null,
    extraKings: { w: [], b: [] },
    rpsPending: null,
    rpsScore: { w: 0, b: 0 },
    heldAbilities: { w: [], b: [] },
  };
}

export function useGambitGame(settings: GameSettings, onlineMatch?: OnlineMatch) {
  const chessRef = useRef(new Chess());
  const [state, setState] = useState<GambitState>(() => initGambitState(chessRef.current, settings));

  const [pendingSpin, setPendingSpin] = useState<Color | null>(null);
  const pendingSpinsRef = useRef<Color[]>([]);

  const [gameOver, setGameOver] = useState<{ isOver: boolean; result: string | null }>({ isOver: false, result: null });
  const [effectTargeting, setEffectTargeting] = useState<{ effect: EffectType; by: Color; step: number; selected: Square[] } | null>(null);

  const onlineRoomRef = useRef<string | null>(null);
  const onlineSyncRef = useRef<(() => void) | null>(null);
  const lastServerProgress = useRef<{ w: number; b: number } | null>(null);
  // Keep a stable ref to onlineMatch so admin functions can read it without deps
  const onlineMatchRef = useRef(onlineMatch);
  useEffect(() => { onlineMatchRef.current = onlineMatch; }, [onlineMatch]);

  const [syncCooldown, setSyncCooldown] = useState(0);
  const lastSyncPressRef = useRef(0);

  useEffect(() => {
    if (syncCooldown <= 0) return;
    const t = setTimeout(() => setSyncCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [syncCooldown]);

  const forceSync = useCallback(() => {
    const elapsed = (Date.now() - lastSyncPressRef.current) / 1000;
    if (elapsed < FORCE_SYNC_COOLDOWN_S) return;
    lastSyncPressRef.current = Date.now();
    setSyncCooldown(FORCE_SYNC_COOLDOWN_S);
    onlineSyncRef.current?.();
  }, []);

  // Resolve RPS game
  const resolveRps = useCallback((winnerColor: Color | null) => {
    setState(s => ({ ...s, rpsPending: null }));
    if (winnerColor !== null) {
      const loser = winnerColor === 'w' ? 'Black' : 'White';
      const winner = winnerColor === 'w' ? 'White' : 'Black';
      setGameOver({ isOver: true, result: `${winner} won by Rock Paper Scissors (${loser} concedes)` });
    }
    // If draw (null winnerColor passed as undefined), just continue game
  }, []);

  // ── Check game over ─────────────────────────────────────────────────────────
  const checkGameOver = useCallback((c: Chess, st?: Partial<GambitState>) => {
    const currentState = st;
    // Royal reversal: check if either queen is gone while reversal is active
    if (currentState?.royalReversal) {
      for (const color of ['w', 'b'] as Color[]) {
        const opp = color === 'w' ? 'b' : 'w';
        if (currentState.royalReversal[color]) {
          const queens = getPieces(c, color, 'q');
          if (queens.length === 0) {
            return { isOver: true, result: `${opp === 'w' ? 'White' : 'Black'} won by capturing the Royal Queen!` };
          }
        }
      }
    }
    if (c.isCheckmate()) {
      const loser = c.turn();
      const winner = loser === 'w' ? 'b' : 'w';
      // Heir mechanic: if loser has an heir, the game continues
      if (currentState?.heir?.[loser]) {
        return { isOver: false, result: null }; // handled in heir activation
      }
      return { isOver: true, result: `${winner === 'w' ? 'White' : 'Black'} won by checkmate` };
    }
    if (c.isStalemate()) return { isOver: true, result: 'Draw by stalemate' };
    if (c.isDraw()) return { isOver: true, result: 'Draw' };
    return { isOver: false, result: null };
  }, []);

  const updateState = useCallback(() => {
    const c = chessRef.current;
    setState(s => ({ ...s, fen: c.fen(), turn: c.turn() }));
  }, []);

  const applyServerRoom = useCallback((room: ServerRoom, myColor: Color | undefined) => {
    const progress = serverProgress(room);
    if (myColor) {
      const prev = lastServerProgress.current;
      if (progress[myColor] <= 0 && (!prev || prev[myColor] > 0)) setPendingSpin(myColor);
    }
    lastServerProgress.current = progress;
    chessRef.current.load(room.fen);
    setState(s => {
      const mergedEffects = mergeServerEffects(s.activeEffects, room.activeEffects);
      const newStockfishElo = room.stockfishElo
        ? { w: room.stockfishElo.white, b: room.stockfishElo.black }
        : s.stockfishElo;
      return {
        ...s,
        fen: room.fen,
        turn: chessRef.current.turn(),
        spinProgress: progress,
        activeEffects: mergedEffects,
        stockfishElo: newStockfishElo,
      };
    });
    setGameOver(checkGameOver(chessRef.current));
  }, [checkGameOver]);

  // ── tickEffects: called after a move to decrement all durations ─────────────
  const tickEffects = useCallback((color: Color) => {
    const c = chessRef.current;
    setState(s => {
      const newEffects = { ...s.activeEffects };
      const expiring = newEffects[color].filter(e => e.duration - 1 <= 0);
      const remaining = newEffects[color].map(e => ({ ...e, duration: e.duration - 1 })).filter(e => e.duration > 0);
      newEffects[color] = remaining;

      let newFen = c.fen();
      let stateChanges: Partial<GambitState> = {};

      // Handle expiring effects
      for (const eff of expiring) {
        if (eff.type === 'backrank_bomb') {
          // Kill everything on ranks 1 and 8
          const backranks: Square[] = ['a1','b1','c1','d1','e1','f1','g1','h1','a8','b8','c8','d8','e8','f8','g8','h8'];
          for (const sq of backranks) {
            const p = c.get(sq as Square);
            if (p && p.type !== 'k') c.remove(sq as Square);
          }
          newFen = c.fen();
        } else if (eff.type === 'car_diagonal' && eff.diagonalSquares) {
          for (const sq of eff.diagonalSquares) {
            const p = c.get(sq as Square);
            if (p && p.type !== 'k') c.remove(sq as Square);
          }
          newFen = c.fen();
        } else if (eff.type === 'kidnap_piece' && eff.kidnappedPiece && eff.targetSquares[0]) {
          // Return kidnapped piece if square is empty
          const sq = eff.targetSquares[0];
          if (!c.get(sq)) c.put(eff.kidnappedPiece, sq);
          newFen = c.fen();
        } else if (eff.type === 'revolt_pawns' && s.revoltedColor) {
          // Revert revolted pawns back to their original color.
          // Only revert as many as were originally revolted — not the caster's
          // own pawns which are also in the same color pool.
          const revColor = s.revoltedColor;
          const allCasterPawns = getPieces(c, color, 'p');
          // eff.targetSquares.length = how many opponent pawns were originally revolted
          const countToRevert = Math.min(eff.targetSquares.length, allCasterPawns.length);
          for (let ri = 0; ri < countToRevert; ri++) {
            c.remove(allCasterPawns[ri]);
            c.put({ type: 'p', color: revColor }, allCasterPawns[ri]);
          }
          stateChanges.revoltedColor = null;
          newFen = c.fen();
        } else if (eff.type === 'royal_reversal') {
          const newRR = { ...s.royalReversal };
          newRR[color] = false;
          stateChanges.royalReversal = newRR;
        } else if (eff.type === 'pawn_sacrifice') {
          // At expiry (turn 5): spawn 25 pawns
          const files = ['a','b','c','d','e','f','g','h'];
          const spawnRanks = color === 'w' ? ['2','3'] : ['6','7'];
          let count = 0;
          for (const rank of spawnRanks) {
            for (const file of files) {
              const sq = `${file}${rank}` as Square;
              if (!c.get(sq) && count < 25) {
                // Don't place on king square
                c.put({ type: 'p', color }, sq);
                count++;
              }
            }
          }
          // Fill remaining on rank 4 or 5
          if (count < 25) {
            const extraRank = color === 'w' ? '4' : '5';
            for (const file of files) {
              const sq = `${file}${extraRank}` as Square;
              if (!c.get(sq) && count < 25) {
                c.put({ type: 'p', color }, sq);
                count++;
              }
            }
          }
          newFen = c.fen();
        }
      }

      // Each-tick effects (while active)
      for (const eff of remaining) {
        if (eff.type === 'six_knights') {
          const myKnights = getPieces(c, color, 'n');
          if (myKnights.length > 0) {
            const sq = myKnights[Math.floor(Math.random() * myKnights.length)];
            c.remove(sq);
            newFen = c.fen();
          }
        } else if (eff.type === 'pawns_to_bishops') {
          const myBishops = getPieces(c, color, 'b');
          if (myBishops.length > 0) {
            const sq = myBishops[Math.floor(Math.random() * myBishops.length)];
            c.remove(sq);
            newFen = c.fen();
          }
        } else if (eff.type === 'king_aura') {
          const opp = color === 'w' ? 'b' : 'w';
          const kingSquares = getPieces(c, color, 'k');
          if (kingSquares.length > 0) {
            const kingSq = kingSquares[0];
            const oppPawns = getPieces(c, opp, 'p');
            for (const pawnSq of oppPawns) {
              if (squareDistance(kingSq, pawnSq) <= 2) {
                c.remove(pawnSq);
              }
            }
            newFen = c.fen();
          }
        }
      }

      // Pawn sacrifice mid-effect: at duration=3 (2 turns elapsed from 5), kill own pawns
      for (const eff of remaining) {
        if (eff.type === 'pawn_sacrifice' && eff.duration === 3) {
          const myPawns = getPieces(c, color, 'p');
          for (const sq of myPawns) c.remove(sq);
          newFen = c.fen();
        }
      }

      // Decay stockfish elo
      const newStockfishElo = { ...s.stockfishElo };
      if (newStockfishElo[color] !== null && newStockfishElo[color]! > 600) {
        newStockfishElo[color] = Math.max(600, newStockfishElo[color]! - 100);
        stateChanges.stockfishElo = newStockfishElo;
      }

      return {
        ...s,
        ...stateChanges,
        activeEffects: newEffects,
        fen: newFen,
      };
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
        return m.from[0] === m.to[0] || m.from[1] === m.to[1];
      });
    }

    // No backward movement
    const noBackward = state.activeEffects[turn].find(e => e.type === 'no_backward');
    if (noBackward) {
      moves = moves.filter(m => {
        const fromRank = parseInt(m.from[1]);
        const toRank = parseInt(m.to[1]);
        if (turn === 'w') return toRank >= fromRank; // white can't go backward (south)
        return toRank <= fromRank; // black can't go backward (north)
      });
    }

    // Shield: opponent can't capture shielded pieces
    const shieldedSquares = state.activeEffects[opp].filter(e => e.type === 'shield_piece').flatMap(e => e.targetSquares);
    moves = moves.filter(m => {
      if (m.flags.includes('c') || m.flags.includes('e')) {
        if (shieldedSquares.includes(m.to as Square)) return false;
      }
      return true;
    });

    // Pawn parry: opponent can't capture `turn`'s pawns with queen or rook
    const pawnParry = state.activeEffects[opp].find(e => e.type === 'pawn_parry');
    if (pawnParry) {
      moves = moves.filter(m => {
        if ((m.piece === 'q' || m.piece === 'r') && (m.flags.includes('c') || m.flags.includes('e'))) {
          const target = c.get(m.to as Square);
          if (target && target.type === 'p') return false;
        }
        return true;
      });
    }

    // Kidnapped squares: pieces on those squares can't be captured
    const kidnappedSquares = state.activeEffects[opp]
      .filter(e => e.type === 'kidnap_piece')
      .flatMap(e => e.targetSquares);
    moves = moves.filter(m => !kidnappedSquares.includes(m.to as Square));

    return moves;
  }, [state.activeEffects]);

  // ── makeMove ────────────────────────────────────────────────────────────────
  const makeMove = useCallback((move: { from: string; to: string; promotion?: string }, ignoreValidation = false) => {
    const c = chessRef.current;
    const turn = c.turn();

    let moveRes: Move | null = null;

    if (ignoreValidation) {
      // Illegal move: directly manipulate the board
      const piece = c.get(move.from as Square);
      if (!piece || piece.color !== turn) return false;
      const target = c.get(move.to as Square);
      if (target?.type === 'k') return false; // kings cannot be captured
      c.remove(move.from as Square);
      if (target) c.remove(move.to as Square);
      const putPiece = move.promotion ? { type: move.promotion as PieceSymbol, color: turn } : piece;
      c.put(putPiece, move.to as Square);
      // Manually flip turn via FEN manipulation
      const tokens = c.fen().split(' ');
      tokens[1] = turn === 'w' ? 'b' : 'w';
      tokens[3] = '-';
      const newMoveNum = parseInt(tokens[5]) + (turn === 'b' ? 1 : 0);
      tokens[5] = String(newMoveNum);
      c.load(tokens.join(' '));

      setState(s => {
        const newIllegal = { ...s.illegalMoveAvailable };
        newIllegal[turn] = false;
        return {
          ...s,
          fen: c.fen(),
          turn: c.turn(),
          illegalMoveAvailable: newIllegal,
          history: [...s.history, c.fen()],
        };
      });
      setGameOver(checkGameOver(c));
      tickEffects(turn);
      return true;
    }

    const moves = getLegalMoves(move.from as Square);
    const validMove = moves.find(m => m.to === move.to && (!move.promotion || m.promotion === move.promotion));
    if (!validMove) return false;

    moveRes = c.move(validMove);
    if (!moveRes) return false;

    let captured: { type: PieceSymbol; color: Color } | null = null;
    if (moveRes.captured) {
      captured = { type: moveRes.captured, color: turn === 'w' ? 'b' : 'w' };
    }

    setState(s => {
      const nextTurn = c.turn();
      let newProgress = { ...s.spinProgress };

      if (settings.mode !== 'online') {
        newProgress[turn] -= 1;
        if (newProgress[turn] <= 0) {
          // Trigger spin + any permanent bonus spins
          const spinsToFire = 1 + s.permanentBonusSpins[turn];
          setPendingSpin(turn);
          for (let i = 1; i < spinsToFire; i++) pendingSpinsRef.current.push(turn);
          newProgress[turn] = settings.spinInterval;
        }
      }

      const newCaptured = captured ? [...s.capturedPieces, captured] : s.capturedPieces;
      const skipTurnEffect = s.activeEffects[nextTurn].find(e => e.type === 'skip_turn');
      let finalFen = c.fen();
      let effects = { ...s.activeEffects };

      // Clean stale freeze_piece entries when a piece is captured
      if (captured) {
        const capturedSq = move.to as Square;
        effects = {
          w: effects.w.map(e => e.type === 'freeze_piece'
            ? { ...e, targetSquares: e.targetSquares.filter(sq => sq !== capturedSq) }
            : e),
          b: effects.b.map(e => e.type === 'freeze_piece'
            ? { ...e, targetSquares: e.targetSquares.filter(sq => sq !== capturedSq) }
            : e),
        };
      }

      if (skipTurnEffect) {
        effects[nextTurn] = effects[nextTurn].filter(e => e.id !== skipTurnEffect.id);
        const tokens = c.fen().split(' ');
        tokens[1] = turn;
        tokens[3] = '-';
        c.load(tokens.join(' '));
        finalFen = c.fen();
      }

      // Chain capture: if chain_capture is active and a pawn just captured, give an extra turn
      if (!skipTurnEffect) {
        const chainCapture = s.activeEffects[turn].find(e => e.type === 'chain_capture');
        if (chainCapture && moveRes && moveRes.captured && moveRes.piece === 'p') {
          const tokens = c.fen().split(' ');
          tokens[1] = turn;
          tokens[3] = '-';
          c.load(tokens.join(' '));
          finalFen = c.fen();
        }
      }

      // Check claimed squares: if opponent moves onto a claimed square
      let claimedSquares = { ...s.claimedSquares };
      const mover = turn;
      const defender = mover === 'w' ? 'b' : 'w';
      if (claimedSquares[defender].includes(move.to as Square)) {
        // Piece just moved there — remove it
        const movedPiece = c.get(move.to as Square);
        if (movedPiece && movedPiece.type !== 'k') {
          c.remove(move.to as Square);
          // Flip turn back to advance opponent now without piece
          const tokens2 = c.fen().split(' ');
          tokens2[1] = nextTurn;
          c.load(tokens2.join(' '));
          finalFen = c.fen();
        }
      }

      // King aura: kill opponent pawns near king
      const kingAura = s.activeEffects[mover].find(e => e.type === 'king_aura');
      if (kingAura) {
        const kingSquares = getPieces(c, mover, 'k');
        if (kingSquares.length > 0) {
          const kingSq = kingSquares[0];
          const oppPawns = getPieces(c, defender, 'p');
          for (const pSq of oppPawns) {
            if (squareDistance(kingSq, pSq) <= 2) c.remove(pSq);
          }
          finalFen = c.fen();
        }
      }

      // Extra kings: check if any extra king of `defender` was captured
      let extraKings = { ...s.extraKings };
      if (moveRes!.captured) {
        const capturedSq = move.to as Square;
        if (extraKings[defender].includes(capturedSq)) {
          extraKings[defender] = extraKings[defender].filter(sq => sq !== capturedSq);
        }
      }

      // Heir: if checkmate detected, activate heir if set
      let heir = { ...s.heir };
      if (c.isCheckmate()) {
        const loser = c.turn();
        if (heir[loser]) {
          const heirSq = heir[loser]!;
          const heirPiece = c.get(heirSq);
          if (heirPiece) {
            const kingSquares = getPieces(c, loser, 'k');
            if (kingSquares.length > 0) {
              c.remove(kingSquares[0]);
              c.put({ type: 'n', color: loser }, kingSquares[0]); // old king becomes a knight
            }
            c.remove(heirSq);
            c.put({ type: 'k', color: loser }, heirSq); // heir becomes king
            const tokens3 = c.fen().split(' ');
            tokens3[1] = loser;
            c.load(tokens3.join(' '));
            finalFen = c.fen();
            heir[loser] = null; // heir used up
          }
        }
      }

      return {
        ...s,
        fen: finalFen,
        turn: c.turn(),
        spinProgress: newProgress,
        capturedPieces: newCaptured,
        history: [...s.history, finalFen],
        activeEffects: effects,
        claimedSquares,
        extraKings,
        heir,
      };
    });
    setGameOver(prev => {
      const result = checkGameOver(c);
      return result;
    });

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
          status: result.isOver ? (result.result?.includes('checkmate') ? 'checkmate' : 'draw') : 'playing',
        }),
      })
        .then(async res => {
          if (!res.ok) { onlineSyncRef.current?.(); return; }
          const room = await res.json() as ServerRoom;
          applyServerRoom(room, myColor);
        })
        .catch(() => onlineSyncRef.current?.());
    }

    if (c.turn() !== turn) tickEffects(turn);
    return true;
  }, [getLegalMoves, settings.mode, settings.spinInterval, tickEffects, checkGameOver, onlineMatch, applyServerRoom]);

  // ── Online poll ─────────────────────────────────────────────────────────────
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
        if (myColor) {
          const prev = lastServerProgress.current;
          if (progress[myColor] <= 0 && (!prev || prev[myColor] > 0)) setPendingSpin(myColor);
        }
        lastServerProgress.current = progress;
        const newStockfishElo = remote.stockfishElo
          ? { w: remote.stockfishElo.white, b: remote.stockfishElo.black }
          : null;
        if (remote.fen === chessRef.current.fen()) {
          setState(s => ({
            ...s,
            spinProgress: progress,
            activeEffects: mergeServerEffects(s.activeEffects, remote.activeEffects),
            ...(newStockfishElo && { stockfishElo: newStockfishElo }),
          }));
          return;
        }
        chessRef.current.load(remote.fen);
        setState(s => ({
          ...s,
          fen: remote.fen,
          turn: chessRef.current.turn(),
          spinProgress: progress,
          activeEffects: mergeServerEffects(s.activeEffects, remote.activeEffects),
          ...(newStockfishElo && { stockfishElo: newStockfishElo }),
        }));
        setGameOver(checkGameOver(chessRef.current));
      } catch {
        // transient
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
    const opp = by === 'w' ? 'b' : 'w';
    const targetColor = def.category === 'buff' ? by : opp;
    const c = chessRef.current;

    // Check ward (block_nerf)
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

    // Duration effects → push to activeEffects
    if (def.duration > 0 && !['car_diagonal', 'backrank_bomb', 'kidnap_piece', 'pawn_sacrifice', 'revolt_pawns', 'six_knights', 'pawns_to_bishops', 'royal_reversal'].includes(effectType)) {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [targetColor]: [...s.activeEffects[targetColor], {
            id: generateId(),
            type: effectType,
            duration: def.duration,
            targetSquares: targets,
          }],
        },
      }));
      return;
    }

    // ── Instant & special-duration effects ────────────────────────────────────
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
    else if (effectType === 'time_rewind') {
      if (state.history.length > 6) {
        const prevFen = state.history[state.history.length - 7];
        c.load(prevFen);
        setState(s => ({ ...s, history: s.history.slice(0, -6) }));
        updateState();
      } else if (state.history.length > 2) {
        const prevFen = state.history[0];
        c.load(prevFen);
        setState(s => ({ ...s, history: [s.history[0]] }));
        updateState();
      }
    }
    else if (effectType === 'bonus_spin') {
      pendingSpinsRef.current.push(by);
    }
    else if (effectType === 'double_spin') {
      setPendingSpin(by);
      pendingSpinsRef.current.push(by);
    }
    else if (effectType === 'five_spin') {
      setPendingSpin(by);
      for (let i = 0; i < 4; i++) pendingSpinsRef.current.push(by);
    }
    else if (effectType === 'permanent_spin') {
      setState(s => {
        const np = { ...s.permanentBonusSpins };
        np[by] = (np[by] ?? 0) + 1;
        return { ...s, permanentBonusSpins: np };
      });
    }
    else if (effectType === 'transfiguration' && targets.length > 0) {
      const targetSq = targets[0];
      const piece = c.get(targetSq);
      if (piece && piece.color !== by && piece.type !== 'p' && piece.type !== 'k') {
        const downgrade: Partial<Record<string, PieceSymbol>> = { q: 'r', r: 'b', b: 'p', n: 'p' };
        const newType = downgrade[piece.type];
        if (newType) {
          c.remove(targetSq);
          const rank = parseInt(targetSq[1]);
          // Pawns can't be on promotion rank — place as bishop instead
          if (newType === 'p' && ((piece.color === 'w' && rank === 8) || (piece.color === 'b' && rank === 1))) {
            c.put({ type: 'b', color: piece.color }, targetSq);
          } else {
            c.put({ type: newType, color: piece.color }, targetSq);
          }
          updateState();
        }
      }
    }
    else if (effectType === 'clear_effects') {
      setState(s => ({ ...s, activeEffects: { w: [], b: [] } }));
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
        let p1 = pieces[Math.floor(Math.random() * pieces.length)];
        let p2 = pieces[Math.floor(Math.random() * pieces.length)];
        while (p2 === p1) p2 = pieces[Math.floor(Math.random() * pieces.length)];
        const piece1 = c.get(p1), piece2 = c.get(p2);
        if (piece1 && piece2) {
          c.remove(p1); c.remove(p2);
          c.put(piece1, p2); c.put(piece2, p1);
          if (c.isCheck()) { c.remove(p1); c.remove(p2); c.put(piece1, p1); c.put(piece2, p2); }
        }
        updateState();
      }
    }
    else if (effectType === 'promote_pawn' && targets.length > 0) {
      c.remove(targets[0]);
      c.put({ type: 'q', color: by }, targets[0]);
      updateState();
    }
    else if (effectType === 'swap_pieces' && targets.length === 2) {
      const p1 = c.get(targets[0]), p2 = c.get(targets[1]);
      if (p1 && p2) {
        c.remove(targets[0]); c.remove(targets[1]);
        c.put(p1, targets[1]); c.put(p2, targets[0]);
        if (c.isCheck()) { c.remove(targets[0]); c.remove(targets[1]); c.put(p1, targets[0]); c.put(p2, targets[1]); }
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
    // ── New piece-placement effects ───────────────────────────────────────────
    else if (['get_pawn','get_knight','get_bishop','get_rook','get_queen','get_king'].includes(effectType) && targets.length > 0) {
      const typeMap: Record<string, PieceSymbol> = {
        get_pawn: 'p', get_knight: 'n', get_bishop: 'b',
        get_rook: 'r', get_queen: 'q', get_king: 'k',
      };
      const pieceType = typeMap[effectType];
      c.put({ type: pieceType, color: by }, targets[0]);
      if (effectType === 'get_king') {
        setState(s => {
          const ek = { ...s.extraKings };
          ek[by] = [...ek[by], targets[0]];
          return { ...s, extraKings: ek };
        });
      }
      updateState();
    }
    // ── All pieces to queens ──────────────────────────────────────────────────
    else if (effectType === 'all_pieces_to_queens') {
      const myPieces = getPieces(c, by).filter(sq => {
        const p = c.get(sq);
        return p && p.type !== 'k' && p.type !== 'q';
      });
      for (const sq of myPieces) {
        c.remove(sq);
        c.put({ type: 'q', color: by }, sq);
      }
      updateState();
    }
    // ── Knights/rooks swap ────────────────────────────────────────────────────
    else if (effectType === 'knights_rooks_swap') {
      const knights = getPieces(c, by, 'n');
      const rooks = getPieces(c, by, 'r');
      for (const sq of knights) { c.remove(sq); c.put({ type: 'r', color: by }, sq); }
      for (const sq of rooks) { c.remove(sq); c.put({ type: 'n', color: by }, sq); }
      updateState();
    }
    // ── Randomize pieces ─────────────────────────────────────────────────────
    else if (effectType === 'randomize_pieces') {
      const types: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q'];
      const myPieces = getPieces(c, by).filter(sq => c.get(sq)?.type !== 'k');
      for (const sq of myPieces) {
        const randomType = types[Math.floor(Math.random() * types.length)];
        c.remove(sq);
        c.put({ type: randomType, color: by }, sq);
      }
      updateState();
    }
    // ── Pawn bomb ────────────────────────────────────────────────────────────
    else if (effectType === 'pawn_bomb' && targets.length > 0) {
      const bombSq = targets[0];
      const adj = adjacentSquares(bombSq);
      c.remove(bombSq); // The pawn itself
      for (const sq of adj) {
        const p = c.get(sq);
        if (p && p.type !== 'k') c.remove(sq); // Kill everything (even own pieces), spare kings
      }
      updateState();
    }
    // ── Opponent pieces to pawns ──────────────────────────────────────────────
    else if (effectType === 'all_to_pawns') {
      const oppPieces = getPieces(c, targetColor).filter(sq => {
        const p = c.get(sq);
        return p && p.type !== 'k' && p.type !== 'p';
      });
      for (const sq of oppPieces) {
        c.remove(sq);
        // Don't place pawn on promotion rank
        const rank = parseInt(sq[1]);
        if ((targetColor === 'w' && rank === 8) || (targetColor === 'b' && rank === 1)) continue;
        c.put({ type: 'p', color: targetColor }, sq);
      }
      updateState();
    }
    // ── Ten pawns ────────────────────────────────────────────────────────────
    else if (effectType === 'ten_pawns') {
      const files = ['a','b','c','d','e','f','g','h'];
      const ranks = by === 'w' ? ['2','3'] : ['6','7'];
      let count = 0;
      for (const rank of ranks) {
        for (const file of files) {
          if (count >= 10) break;
          const sq = `${file}${rank}` as Square;
          if (!c.get(sq)) {
            c.put({ type: 'p', color: by }, sq);
            count++;
          }
        }
        if (count >= 10) break;
      }
      updateState();
    }
    // ── Six knights ──────────────────────────────────────────────────────────
    else if (effectType === 'six_knights') {
      const emptySquares: Square[] = [];
      const homeRanks = by === 'w' ? ['1','2','3'] : ['6','7','8'];
      const files = ['a','b','c','d','e','f','g','h'];
      for (const rank of homeRanks) {
        for (const file of files) {
          const sq = `${file}${rank}` as Square;
          if (!c.get(sq)) emptySquares.push(sq);
        }
      }
      const toPlace = emptySquares.slice(0, 6);
      for (const sq of toPlace) c.put({ type: 'n', color: by }, sq);
      updateState();
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 6,
            targetSquares: toPlace,
          }],
        },
      }));
      return;
    }
    // ── Pawns to bishops ─────────────────────────────────────────────────────
    else if (effectType === 'pawns_to_bishops') {
      const myPawns = getPieces(c, by, 'p');
      for (const sq of myPawns) {
        c.remove(sq);
        c.put({ type: 'b', color: by }, sq);
      }
      updateState();
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Car diagonal ─────────────────────────────────────────────────────────
    else if (effectType === 'car_diagonal') {
      const diagonalSqs = getRandomDiagonal();
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: diagonalSqs,
            diagonalSquares: diagonalSqs,
          }],
        },
      }));
      return;
    }
    // ── Illegal move ─────────────────────────────────────────────────────────
    else if (effectType === 'illegal_move') {
      setState(s => {
        const ni = { ...s.illegalMoveAvailable };
        ni[by] = true;
        return { ...s, illegalMoveAvailable: ni };
      });
    }
    // ── Backrank bomb ────────────────────────────────────────────────────────
    else if (effectType === 'backrank_bomb') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 6,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Claim square ─────────────────────────────────────────────────────────
    else if (effectType === 'claim_square' && targets.length > 0) {
      setState(s => {
        const cs = { ...s.claimedSquares };
        cs[by] = [...cs[by], targets[0]];
        return { ...s, claimedSquares: cs };
      });
    }
    // ── King aura ────────────────────────────────────────────────────────────
    else if (effectType === 'king_aura') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Revolt pawns ─────────────────────────────────────────────────────────
    else if (effectType === 'revolt_pawns') {
      const oppPawns = getPieces(c, opp, 'p');
      for (const sq of oppPawns) {
        c.remove(sq);
        c.put({ type: 'p', color: by }, sq);
      }
      updateState();
      setState(s => ({
        ...s,
        revoltedColor: opp,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: oppPawns,
          }],
        },
      }));
      return;
    }
    // ── Chain capture (duration, no instant effect) ──────────────────────────
    else if (effectType === 'chain_capture') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Pawn parry (duration) ────────────────────────────────────────────────
    else if (effectType === 'pawn_parry') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── No backward (duration) ──────────────────────────────────────────────
    else if (effectType === 'no_backward') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [opp]: [...s.activeEffects[opp], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Heir selection ───────────────────────────────────────────────────────
    else if (effectType === 'heir_selection' && targets.length > 0) {
      setState(s => {
        const newHeir = { ...s.heir };
        newHeir[by] = targets[0];
        return { ...s, heir: newHeir };
      });
    }
    // ── Royal reversal ───────────────────────────────────────────────────────
    else if (effectType === 'royal_reversal') {
      setState(s => ({
        ...s,
        royalReversal: { ...s.royalReversal, [by]: true },
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 3,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Stockfish advisor ────────────────────────────────────────────────────
    else if (effectType === 'stockfish_advisor') {
      setState(s => {
        const se = { ...s.stockfishElo };
        se[by] = 2500;
        return { ...s, stockfishElo: se };
      });
    }
    // ── Economy sell ─────────────────────────────────────────────────────────
    else if (effectType === 'economy_sell' && targets.length > 0) {
      const piece = c.get(targets[0]);
      if (piece && piece.type !== 'k') {
        const soldValue = PIECE_VALUES[piece.type];
        const newType = randomPieceForValue(soldValue);
        c.remove(targets[0]);
        c.put({ type: newType, color: by }, targets[0]);
        updateState();
      }
    }
    // ── Pawn sacrifice ──────────────────────────────────────────────────────
    else if (effectType === 'pawn_sacrifice') {
      setState(s => ({
        ...s,
        activeEffects: {
          ...s.activeEffects,
          [by]: [...s.activeEffects[by], {
            id: generateId(),
            type: effectType,
            duration: 5,
            targetSquares: [],
          }],
        },
      }));
      return;
    }
    // ── Kidnap piece ─────────────────────────────────────────────────────────
    else if (effectType === 'kidnap_piece' && targets.length > 0) {
      const piece = c.get(targets[0]);
      if (piece && piece.type !== 'k') {
        c.remove(targets[0]);
        updateState();
        setState(s => ({
          ...s,
          activeEffects: {
            ...s.activeEffects,
            [by]: [...s.activeEffects[by], {
              id: generateId(),
              type: effectType,
              duration: 2,
              targetSquares: [targets[0]],
              kidnappedPiece: piece,
            }],
          },
        }));
        return;
      }
    }
    // ── RPS win ──────────────────────────────────────────────────────────────
    else if (effectType === 'rps_win') {
      setState(s => ({ ...s, rpsPending: by, rpsScore: { w: 0, b: 0 } }));
    }

    // ── Post effect to server ─────────────────────────────────────────────────
    if (settings.mode === 'online' && onlineMatch?.roomId && onlineMatch.color) {
      const serverColor = onlineMatch.color === 'w' ? 'white' : 'black';
      const roomId = onlineMatch.roomId;
      void fetch(`${WORKER_PROXY}/rooms/${roomId}/effect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effect: { type: effectType },
          color: serverColor,
          resultFen: c.fen(),
          spinInterval: settings.spinInterval,
        }),
      })
        .then(async res => {
          if (!res.ok) return;
          const room = await res.json() as ServerRoom;
          const progress = serverProgress(room);
          lastServerProgress.current = progress;
          setState(s => ({ ...s, spinProgress: progress }));
        })
        .catch(() => onlineSyncRef.current?.());
    }
  }, [state, updateState, settings.mode, settings.spinInterval, onlineMatch]);

  // ── initiateEffect & handleTargetClick ─────────────────────────────────────

  /** Internal: apply or enter targeting mode — no holdable routing. Used by activateHeldAbility. */
  const applyOrTarget = useCallback((effectType: EffectType, by: Color) => {
    const def = EFFECTS[effectType];
    if (def.targetRule !== 'none') {
      setEffectTargeting({ effect: effectType, by, step: 0, selected: [] });
    } else {
      applyEffect(effectType, by);
    }
  }, [applyEffect]);

  /**
   * Primary entry point for spin results and admin force-effects.
   * If the effect is holdable, it goes into the player's hand (max HAND_SIZE_LIMIT,
   * oldest discarded) instead of being applied immediately.
   * Pass forceApply=true to skip holdable routing (e.g. for the bot).
   */
  const initiateEffect = useCallback((effectType: EffectType, by: Color, forceApply = false) => {
    const def = EFFECTS[effectType];
    if (def.holdable && !forceApply) {
      // Add to hand; if at capacity, drop the oldest
      setState(s => {
        const current = s.heldAbilities[by];
        const newAbility: HeldAbility = { id: generateId(), type: effectType };
        const newHand = current.length >= HAND_SIZE_LIMIT
          ? [...current.slice(1), newAbility]
          : [...current, newAbility];
        return { ...s, heldAbilities: { ...s.heldAbilities, [by]: newHand } };
      });
      return;
    }
    applyOrTarget(effectType, by);
  }, [applyOrTarget]);

  /** Activate a held ability from the player's hand by its ID. */
  const activateHeldAbility = useCallback((abilityId: string, abilityType: EffectType, by: Color) => {
    // Remove from hand first
    setState(s => ({
      ...s,
      heldAbilities: {
        ...s.heldAbilities,
        [by]: s.heldAbilities[by].filter(a => a.id !== abilityId),
      },
    }));
    // Then apply/target (bypassing holdable routing since the player chose to use it)
    applyOrTarget(abilityType, by);
  }, [applyOrTarget]);

  const handleTargetClick = useCallback((square: Square) => {
    if (!effectTargeting) return;
    const { effect, by, selected } = effectTargeting;
    const def = EFFECTS[effect];
    const c = chessRef.current;
    const piece = c.get(square);

    const isValid = (): boolean => {
      switch (def.targetRule) {
        case 'own_piece': return !!(piece && piece.color === by);
        case 'opponent_piece': return !!(piece && piece.color !== by && piece.type !== 'k');
        case 'opponent_non_pawn': return !!(piece && piece.color !== by && piece.type !== 'p' && piece.type !== 'k');
        case 'own_pawn': return !!(piece && piece.color === by && piece.type === 'p');
        case 'own_non_king': return !!(piece && piece.color === by && piece.type !== 'k');
        case 'empty_square': {
          if (piece) return false;
          // Pawns can't be placed on promotion ranks
          if (effect === 'get_pawn') {
            const rank = parseInt(square[1]);
            if (by === 'w' && rank === 8) return false;
            if (by === 'b' && rank === 1) return false;
          }
          return true;
        }
        case 'any_square': return true;
        case 'two_own_pieces': return !!(piece && piece.color === by);
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
          if (caps.length === 0) { setEffectTargeting(null); return; }
          const vals: Record<PieceSymbol, number> = { q:9, r:5, b:3, n:3, p:1, k:0 };
          caps.sort((a, b) => vals[b.type] - vals[a.type]);
          revived = caps[0].type;
        }
        applyEffect(effect, by, newSelected, revived);
        setEffectTargeting(null);
      }
    }
  }, [effectTargeting, applyEffect, state.capturedPieces]);

  // ── Resolve spin: pop from queue ────────────────────────────────────────────
  const resolveCurrentSpin = useCallback(() => {
    if (pendingSpinsRef.current.length > 0) {
      const next = pendingSpinsRef.current.shift()!;
      setPendingSpin(next);
    } else {
      setPendingSpin(null);
    }
  }, []);

  /** Admin / debug helper: force a spin for any color without waiting for spinProgress */
  const triggerSpin = useCallback((color: Color) => {
    setPendingSpin(color);
  }, []);

  /** Push the current board FEN to the worker (admin only, no spin advancement). */
  const adminSyncFenToWorker = useCallback((fen: string) => {
    const match = onlineMatchRef.current;
    if (match?.status !== 'matched' || !match.roomId) return;
    void fetch(`${WORKER_PROXY}/rooms/${match.roomId}/sync-fen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }),
    }).catch(() => {});
  }, []);

  /** Admin / debug helper: load a custom FEN directly */
  const loadFen = useCallback((fen: string) => {
    try {
      chessRef.current.load(fen);
      setState(s => ({ ...s, fen: chessRef.current.fen(), turn: chessRef.current.turn() }));
      adminSyncFenToWorker(chessRef.current.fen());
    } catch {
      // ignore invalid FEN
    }
  }, [adminSyncFenToWorker]);

  /** Admin helper: force whose turn it is */
  const forceSetTurn = useCallback((color: Color) => {
    const tokens = chessRef.current.fen().split(' ');
    tokens[1] = color;
    tokens[3] = '-'; // clear en-passant
    try {
      chessRef.current.load(tokens.join(' '));
      setState(s => ({ ...s, fen: chessRef.current.fen(), turn: color }));
      adminSyncFenToWorker(chessRef.current.fen());
    } catch { /* ignore */ }
  }, [adminSyncFenToWorker]);

  /** Admin helper: clear all active effects for a player */
  const clearPlayerEffects = useCallback((color: Color) => {
    setState(s => ({
      ...s,
      activeEffects: { ...s.activeEffects, [color]: [] },
    }));
  }, []);

  /** Admin helper: directly set spin countdown for a player */
  const setSpinProgress = useCallback((color: Color, value: number) => {
    setState(s => ({
      ...s,
      spinProgress: { ...s.spinProgress, [color]: Math.max(1, value) },
    }));
  }, []);

  /** Admin helper: place or remove a piece on the board */
  const spawnPiece = useCallback((square: Square, piece: { type: PieceSymbol; color: Color } | null) => {
    try {
      if (piece) {
        chessRef.current.put(piece, square);
      } else {
        chessRef.current.remove(square);
      }
      setState(s => ({ ...s, fen: chessRef.current.fen() }));
      adminSyncFenToWorker(chessRef.current.fen());
    } catch { /* ignore invalid placement */ }
  }, [adminSyncFenToWorker]);

  /** Admin helper: rigged spin outcomes — the next organic spin for each color lands on this effect */
  const [riggedSpins, setRiggedSpinsState] = useState<{ w: EffectType | null; b: EffectType | null }>({ w: null, b: null });
  const setRiggedSpin = useCallback((color: Color, effect: EffectType | null) => {
    setRiggedSpinsState(s => ({ ...s, [color]: effect }));
  }, []);

  return {
    state,
    chess: chessRef.current,
    pendingSpin,
    resolveCurrentSpin,
    gameOver,
    makeMove,
    getLegalMoves,
    initiateEffect,
    activateHeldAbility,
    effectTargeting,
    setEffectTargeting,
    handleTargetClick,
    forceSync,
    syncCooldown,
    resolveRps,
    selectWeightedEffect: (enabledEffects: EffectType[]) => selectWeightedEffect(enabledEffects),
    triggerSpin,
    loadFen,
    forceSetTurn,
    clearPlayerEffects,
    setSpinProgress,
    spawnPiece,
    riggedSpins,
    setRiggedSpin,
  };
}

function normalizeOnlineColor(color: unknown): Color | undefined {
  if (color === 'white' || color === 'w') return 'w';
  if (color === 'black' || color === 'b') return 'b';
  return undefined;
}
