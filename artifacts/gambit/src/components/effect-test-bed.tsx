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
import SpinWheel from '@/components/spin-wheel';
import RpsOverlay from '@/components/rps-overlay';

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
    pendingSpin, resolveCurrentSpin, resolveRps,
  } = useGambitGame(TEST_SETTINGS);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [effectApplied, setEffectApplied] = useState(false);
  // Incremented each time a spin resolves so SpinWheel fully remounts for the
  // next queued spin even when the color (pendingSpin) stays the same.
  const [spinGen, setSpinGen] = useState(0);

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
      // If illegal_move effect is active, allow any move ignoring chess rules
      if (state.illegalMoveAvailable[state.turn]) {
        const piece = chess.get(selectedSquare);
        if (piece) {
          const promo = piece.type === 'p' && (sq[1] === '8' || sq[1] === '1') ? 'q' : undefined;
          makeMove({ from: selectedSquare, to: sq, promotion: promo }, true);
          setSelectedSquare(null); setLegalMoves([]); return;
        }
      }
    }
    const piece = chess.get(sq);
    if (piece?.color === state.turn) {
      if (selectedSquare === sq) { setSelectedSquare(null); setLegalMoves([]); }
      else { setSelectedSquare(sq); setLegalMoves(getLegalMoves(sq)); }
    } else { setSelectedSquare(null); setLegalMoves([]); }
  }, [effectTargeting, handleTargetClick, selectedSquare, legalMoves, chess, state.turn, state.illegalMoveAvailable, makeMove, getLegalMoves]);

  const applyEffect = () => {
    initiateEffect(effectType, 'w');
    // bonus_spin pushes to pendingSpinsRef but never calls setPendingSpin directly
    // (it's designed to fire after an organic spin resolves). In the isolated test
    // bed there is no active spin, so we manually kick the queue so the wheel appears.
    if (effectType === 'bonus_spin') {
      resolveCurrentSpin();
    }
    setEffectApplied(true);
  };

  const resetBoard = () => {
    loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setEffectApplied(false);
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  // State indicators for effects with no obvious visual output
  const hasPermanentBonus = (state.permanentBonusSpins.w ?? 0) > 0 || (state.permanentBonusSpins.b ?? 0) > 0;
  const hasStockfishAdvisor = state.stockfishElo.w !== null || state.stockfishElo.b !== null;
  const hasRoyalReversal = state.royalReversal?.w || state.royalReversal?.b;
  const hasExtraKings = (state.extraKings?.w?.length ?? 0) > 0 || (state.extraKings?.b?.length ?? 0) > 0;
  const hasIllegalMove = state.illegalMoveAvailable.w || state.illegalMoveAvailable.b;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px 20px', gap: 10, overflowY: 'auto' }}>

      {/* RPS overlay */}
      {state.rpsPending !== null && (
        <RpsOverlay
          challenger={state.rpsPending}
          onResult={resolveRps}
        />
      )}

      {/* Spin wheel — shown when a wheel-triggering effect fires */}
      {pendingSpin !== null && (
        <SpinWheel
          key={`spin-${spinGen}`}
          spinningFor={pendingSpin}
          enabledEffects={TEST_SETTINGS.enabledEffects}
          onEffect={effect => {
            initiateEffect(effect, pendingSpin);
            setSpinGen(g => g + 1);
            resolveCurrentSpin();
          }}
        />
      )}

      {/* Effect targeting banner */}
      {effectTargeting && (
        <div style={{ background: 'linear-gradient(135deg,#ff2d78,#ff9900)', color: '#fff', padding: '8px 18px', borderRadius: 50, fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          🎯 Pick a target for <strong>{def.label}</strong>
          <button style={{ background: 'rgba(0,0,0,0.25)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#fff', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEffectTargeting(null)}>✕</button>
        </div>
      )}

      {/* State indicators for effects with no obvious visual feedback */}
      {hasIllegalMove && (
        <div style={{ background: 'rgba(255,45,120,0.12)', border: '2px solid rgba(255,45,120,0.5)', borderRadius: 10, padding: '6px 14px', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: '#ff2d78' }}>
          🚨 Illegal move active — click any piece, then any square to make an illegal move
        </div>
      )}
      {hasPermanentBonus && (
        <div style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.4)', borderRadius: 10, padding: '6px 14px', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: '#39ff14' }}>
          ⚙️ Permanent bonus spins — W: +{state.permanentBonusSpins.w ?? 0} &nbsp; B: +{state.permanentBonusSpins.b ?? 0}
          &nbsp;(spin count stacks every time that player earns a spin)
        </div>
      )}
      {hasStockfishAdvisor && (
        <div style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 10, padding: '8px 14px', fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem', color: '#39ff14' }}>
          🧠 STOCKFISH ADVISOR — W: {state.stockfishElo.w ?? '—'} ELO &nbsp; B: {state.stockfishElo.b ?? '—'} ELO
          &nbsp;(decays each turn; works in actual game, not visible here)
        </div>
      )}
      {hasRoyalReversal && (
        <div style={{ background: 'rgba(191,95,255,0.12)', border: '1px solid rgba(191,95,255,0.4)', borderRadius: 10, padding: '6px 14px', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: '#bf5fff' }}>
          🃏 Royal Reversal active — W: {state.royalReversal?.w ? 'yes' : 'no'} &nbsp; B: {state.royalReversal?.b ? 'yes' : 'no'}
          &nbsp;(capturing opponent's queen now wins the game)
        </div>
      )}
      {hasExtraKings && (
        <div style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.4)', borderRadius: 10, padding: '6px 14px', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: '#ff9900' }}>
          🔱 Extra kings — W: [{(state.extraKings?.w ?? []).join(', ') || 'none'}] &nbsp; B: [{(state.extraKings?.b ?? []).join(', ') || 'none'}]
          &nbsp;(chess.js may limit legal moves with 2 kings)
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
