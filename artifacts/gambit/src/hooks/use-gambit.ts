import { useEffect, useRef, useState, useCallback } from 'react';
import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import { EFFECTS, EffectType, GambitState, ActiveEffect, generateId, getPieces, getAllSquares } from './gambit-engine';

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

export function useGambitGame(settings: GameSettings) {
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

  const tickEffects = useCallback((color: Color) => {
    setState(s => {
      const newEffects = { ...s.activeEffects };
      newEffects[color] = newEffects[color].map(e => ({ ...e, duration: e.duration - 1 })).filter(e => e.duration > 0);
      return { ...s, activeEffects: newEffects };
    });
  }, []);

  // Filter legal moves based on active effects
  const getLegalMoves = useCallback((square?: Square) => {
    const c = chessRef.current;
    const turn = c.turn();
    const opp = turn === 'w' ? 'b' : 'w';
    
    // Check force pawn effect
    const forcePawnEffect = state.activeEffects[turn].find(e => e.type === 'force_pawn');
    let moves = c.moves({ square, verbose: true }) as Move[];

    if (forcePawnEffect) {
      const pawnMoves = moves.filter(m => m.piece === 'p');
      if (pawnMoves.length > 0) moves = pawnMoves;
    }

    // Filter out frozen pieces
    const frozenSquares = state.activeEffects[turn].filter(e => e.type === 'freeze_piece').flatMap(e => e.targetSquares);
    moves = moves.filter(m => !frozenSquares.includes(m.from as Square));

    // Filter Queen downgrade
    const queenDowngrade = state.activeEffects[turn].find(e => e.type === 'downgrade_queen');
    if (queenDowngrade) {
      moves = moves.filter(m => {
        if (m.piece !== 'q') return true;
        // Queen moves like a rook: rank or file must be same
        const fromFile = m.from[0];
        const fromRank = m.from[1];
        const toFile = m.to[0];
        const toRank = m.to[1];
        return fromFile === toFile || fromRank === toRank;
      });
    }

    // Filter shielded captures
    const shieldedSquares = state.activeEffects[opp].filter(e => e.type === 'shield_piece').flatMap(e => e.targetSquares);
    moves = moves.filter(m => {
      if (m.flags.includes('c') || m.flags.includes('e')) {
        // if capture, check if target square is shielded
        if (shieldedSquares.includes(m.to as Square)) return false;
      }
      return true;
    });

    return moves;
  }, [state.activeEffects]);

  const makeMove = useCallback((move: { from: string, to: string, promotion?: string }) => {
    const moves = getLegalMoves(move.from as Square);
    const validMove = moves.find(m => m.to === move.to && (!move.promotion || m.promotion === move.promotion));
    
    if (!validMove) return false;

    const c = chessRef.current;
    const turn = c.turn();
    const moveRes = c.move(validMove);
    
    if (moveRes) {
      // Capture tracking
      let captured: { type: PieceSymbol; color: Color } | null = null;
      if (moveRes.captured) {
        captured = { type: moveRes.captured, color: turn === 'w' ? 'b' : 'w' };
      }
      
      setState(s => {
        const nextTurn = c.turn();
        
        let newProgress = { ...s.spinProgress };
        newProgress[turn] -= 1;
        
        if (newProgress[turn] <= 0) {
          setPendingSpin(turn);
          newProgress[turn] = settings.spinInterval;
        }

        const newCaptured = captured ? [...s.capturedPieces, captured] : s.capturedPieces;

        // Skip turn effect applied to next player?
        const skipTurnEffect = s.activeEffects[nextTurn].find(e => e.type === 'skip_turn');
        let finalTurn = nextTurn;
        let finalFen = c.fen();
        let effects = { ...s.activeEffects };

        if (skipTurnEffect) {
          // Remove skip turn, flip turn back
          effects[nextTurn] = effects[nextTurn].filter(e => e.id !== skipTurnEffect.id);
          const tokens = c.fen().split(' ');
          tokens[1] = turn; // switch turn back
          tokens[3] = '-'; // clear en passant
          c.load(tokens.join(' '));
          finalFen = c.fen();
          tickEffects(turn); // tick again since they get another turn immediately? Actually no, skip turn means opponent loses their turn, so we just pass it back. Let's just manually flip.
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
      
      // Tick effects for the NEW turn player (unless we skipped)
      if (c.turn() !== turn) {
        tickEffects(c.turn());
      }
      
      return true;
    }
    return false;
  }, [getLegalMoves, settings.spinInterval, tickEffects, checkGameOver]);

  const applyEffect = useCallback((effectType: EffectType, by: Color, targets: Square[] = [], revivedPiece?: PieceSymbol) => {
    const def = EFFECTS[effectType];
    const targetColor = def.category === 'buff' ? by : (by === 'w' ? 'b' : 'w');
    const c = chessRef.current;

    // Check ward
    if (def.category === 'nerf') {
      const wardIdx = state.activeEffects[targetColor].findIndex(e => e.type === 'block_nerf');
      if (wardIdx >= 0) {
        // Consume ward and block
        setState(s => {
          const newEffects = { ...s.activeEffects };
          newEffects[targetColor] = newEffects[targetColor].filter((_, i) => i !== wardIdx);
          return { ...s, activeEffects: newEffects };
        });
        return; // Blocked!
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
      // Immediate effects
      if (effectType === 'extra_turn') {
        const tokens = c.fen().split(' ');
        tokens[1] = by; // stay their turn
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
          // just pick 2 random
          const p1 = pieces[Math.floor(Math.random() * pieces.length)];
          let p2 = pieces[Math.floor(Math.random() * pieces.length)];
          while (p2 === p1) p2 = pieces[Math.floor(Math.random() * pieces.length)];
          
          const piece1 = c.get(p1);
          const piece2 = c.get(p2);
          if (piece1 && piece2) {
            c.remove(p1); c.remove(p2);
            c.put(piece1, p2); c.put(piece2, p1);
            if (c.isCheck()) {
              // revert if illegal check
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
        // remove from captured
        setState(s => {
          const cap = [...s.capturedPieces];
          const idx = cap.findIndex(p => p.color === by && p.type === revivedPiece);
          if (idx >= 0) cap.splice(idx, 1);
          return { ...s, capturedPieces: cap };
        });
        updateState();
      }
    }
  }, [state, updateState]);

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
        // Need to handle revive piece specific flow (picking which piece to revive)
        // For simplicity, we auto-pick the highest value captured piece for Revive.
        let revived: PieceSymbol | undefined;
        if (effect === 'revive_piece') {
          const caps = state.capturedPieces.filter(p => p.color === by);
          if (caps.length === 0) {
            setEffectTargeting(null);
            return; // Can't revive if nothing captured
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
  };
}
