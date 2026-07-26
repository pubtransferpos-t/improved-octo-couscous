/**
 * GameTestBed — isolated game instance for one effect test.
 * Rendered with a changing `key` by EffectTest so it fully remounts
 * (fresh chess.js instance + fresh GambitState) for every new effect.
 */
import { useState, useCallback } from 'react';
import { Move, Square } from 'chess.js';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';
import { useGambitGame, DEFAULT_SETTINGS, GameSettings } from '@/hooks/use-gambit';
import ChessBoard from '@/components/chess-board';

const TEST_SETTINGS: GameSettings = {
  ...DEFAULT_SETTINGS,
  mode: 'custom',
  spinInterval: 99,
  enabledEffects: Object.keys(EFFECTS) as EffectType[],
};

interface Props {
  effectType: EffectType;
  onWorking: () => void;
  onFailed: () => void;
}

export default function GameTestBed({ effectType, onWorking, onFailed }: Props) {
  const {
    state, chess, makeMove, getLegalMoves, effectTargeting,
    setEffectTargeting, handleTargetClick, initiateEffect, loadFen,
  } = useGambitGame(TEST_SETTINGS);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [effectApplied, setEffectApplied] = useState(false);

  const def = EFFECTS[effectType];

  const handleSquareClick = useCallback((sq: Square) => {
    if (effectTargeting) { handleTargetClick(sq); return; }
    if (selectedSquare) {
      const isLegal = legalMoves.find(m => m.to === sq);
      if (isLegal) {
        const piece = chess.get(selectedSquare);
        const promo = piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1') ? 'q' : undefined;
        makeMove({ from: selectedSquare, to: sq, promotion: promo });
        setSelectedSquare(null); setLegalMoves([]); return;
      }
    }
    const piece = chess.get(sq);
    if (piece?.color === state.turn) {
      if (selectedSquare === sq) { setSelectedSquare(null); setLegalMoves([]); }
      else { setSelectedSquare(sq); setLegalMoves(getLegalMoves(sq)); }
    } else { setSelectedSquare(null); setLegalMoves([]); }
  }, [effectTargeting, handleTargetClick, selectedSquare, legalMoves, chess, state.turn, makeMove, getLegalMoves]);

  const applyEffect = () => {
    initiateEffect(effectType, 'w');
    setEffectApplied(true);
  };

  const resetBoard = () => {
    loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setEffectApplied(false);
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px 20px', gap: 10, overflowY: 'auto' }}>

      {/* Effect targeting banner */}
      {effectTargeting && (
        <div style={{ background: 'linear-gradient(135deg,#ff2d78,#ff9900)', color: '#fff', padding: '8px 18px', borderRadius: 50, fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          🎯 Pick a target for <strong>{def.label}</strong>
          <button style={{ background: 'rgba(0,0,0,0.25)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#fff', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEffectTargeting(null)}>✕</button>
        </div>
      )}

      {/* Board */}
      <ChessBoard
        chess={chess}
        state={state}
        selectedSquare={selectedSquare}
        legalMoves={legalMoves}
        lastMove={null}
        onSquareClick={handleSquareClick}
        playerColor={null}
        effectTargeting={effectTargeting}
      />

      {/* Apply / Reset */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {!effectApplied ? (
          <button onClick={applyEffect} style={btn('#ff9900')}>
            {def.emoji} Apply as White
          </button>
        ) : (
          <button onClick={resetBoard} style={btn('#bf5fff')}>↺ Reset Board</button>
        )}
      </div>

      {/* Verdict */}
      <div style={{ display: 'flex', gap: 14 }}>
        <button onClick={onWorking} style={{
          padding: '13px 36px', borderRadius: 12, fontSize: '1.1rem',
          fontFamily: '"Boogaloo", sans-serif', cursor: 'pointer',
          background: 'rgba(57,255,20,0.15)', border: '2px solid rgba(57,255,20,0.6)',
          color: '#39ff14', transition: 'all 0.15s',
        }}>✓ Working</button>
        <button onClick={onFailed} style={{
          padding: '13px 36px', borderRadius: 12, fontSize: '1.1rem',
          fontFamily: '"Boogaloo", sans-serif', cursor: 'pointer',
          background: 'rgba(255,45,120,0.15)', border: '2px solid rgba(255,45,120,0.6)',
          color: '#ff2d78', transition: 'all 0.15s',
        }}>✗ Failed</button>
      </div>

    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: '9px 22px', borderRadius: 10, fontSize: '1rem',
    fontFamily: '"Boogaloo", sans-serif', cursor: 'pointer',
    background: `${color}20`, border: `1.5px solid ${color}80`,
    color, transition: 'all 0.15s',
  };
}
