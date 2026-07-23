import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Color, Move, PieceSymbol, Square } from 'chess.js';
import { useGambitGame, GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType, GambitState } from '@/hooks/gambit-engine';
import ChessBoard from '@/components/chess-board';
import SpinWheel from '@/components/spin-wheel';
import { getGameSettings } from './home';

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const C = {
  bg:      '#0d0d0d',
  surface: '#131313',
  border:  '#272727',
  red:     '#f72f22',
  yellow:  '#ffd600',
  text:    '#ede9e2',
  sub:     '#777',
  dim:     '#3a3a3a',
  green:   '#21d47e',
  nerf:    '#f72f22',
} as const;

export default function Game() {
  const [, setLocation] = useLocation();

  const settings: GameSettings = (() => {
    try { return getGameSettings(); } catch { return DEFAULT_SETTINGS; }
  })();

  const [playerColor] = useState<Color>(() =>
    settings.playerColor === 'random'
      ? Math.random() < 0.5 ? 'w' : 'b'
      : settings.playerColor as Color,
  );

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const botScheduled = useRef(false);

  const {
    state,
    chess,
    pendingSpin,
    setPendingSpin,
    gameOver,
    makeMove,
    getLegalMoves,
    initiateEffect,
    effectTargeting,
    setEffectTargeting,
    handleTargetClick,
  } = useGambitGame(settings);

  // ── Bot AI ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.mode !== 'bot') { console.log('[bot-effect] skip: not bot mode'); return; }
    if (state.turn === playerColor) { console.log('[bot-effect] skip: player turn', state.turn); return; }
    if (gameOver.isOver) { console.log('[bot-effect] skip: game over'); return; }
    if (pendingSpin !== null) { console.log('[bot-effect] skip: pendingSpin', pendingSpin); return; }
    if (effectTargeting !== null) { console.log('[bot-effect] skip: effectTargeting active'); return; }
    if (botScheduled.current) { console.log('[bot-effect] skip: already scheduled'); return; }

    console.log('[bot-effect] scheduling bot move, turn:', state.turn, 'fen:', state.fen);
    botScheduled.current = true;
    setBotThinking(true);

    const filteredMoves = getLegalMoves();
    console.log('[bot-effect] effect-filtered legal moves:', filteredMoves.length, filteredMoves.map(m => `${m.from}-${m.to}`));

    const timer = setTimeout(async () => {
      console.log('[bot-effect] timeout fired, calling getBotMove');
      const { getBotMove } = await import('@/lib/bot');
      const move = getBotMove(state.fen, settings.botElo, filteredMoves);
      console.log('[bot-effect] getBotMove returned:', move);
      if (move) {
        const result = makeMove({ from: move.from, to: move.to, promotion: move.promotion });
        console.log('[bot-effect] makeMove result:', result);
      } else {
        console.warn('[bot-effect] getBotMove returned null — no move made');
      }
      setBotThinking(false);
      botScheduled.current = false;
    }, 450);
    return () => {
      clearTimeout(timer);
      botScheduled.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.fen, gameOver.isOver, pendingSpin, effectTargeting]);

  // ── Bot auto-spin ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.mode !== 'bot') return;
    if (pendingSpin === null) return;
    if (pendingSpin === playerColor) return;
    const timer = setTimeout(() => {
      const pool = settings.enabledEffects;
      if (pool.length > 0) {
        const effect = pool[Math.floor(Math.random() * pool.length)];
        initiateEffect(effect, pendingSpin);
      }
      setPendingSpin(null);
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpin]);

  // ── Clear selection on turn change ────────────────────────────────────────
  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
  }, [state.turn]);

  // ── Square click ──────────────────────────────────────────────────────────
  const handleSquareClick = useCallback((sq: Square) => {
    if (effectTargeting) {
      handleTargetClick(sq);
      return;
    }

    if (settings.mode === 'bot' && state.turn !== playerColor) return;

    if (selectedSquare) {
      const isLegal = legalMoves.find(m => m.to === sq);
      if (isLegal) {
        const piece = chess.get(selectedSquare);
        const promo = piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1') ? 'q' : undefined;
        makeMove({ from: selectedSquare, to: sq, promotion: promo });
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
    }

    const piece = chess.get(sq);
    const canControl =
      settings.mode === 'pass-and-play' || settings.mode === 'custom'
        ? piece?.color === state.turn
        : piece?.color === playerColor && piece.color === state.turn;

    if (canControl) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
        setLegalMoves([]);
      } else {
        setSelectedSquare(sq);
        setLegalMoves(getLegalMoves(sq));
      }
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }, [
    effectTargeting, handleTargetClick, selectedSquare, legalMoves, chess,
    state.turn, makeMove, getLegalMoves, settings.mode, playerColor,
  ]);

  const boardOrientation: Color | null =
    settings.mode === 'pass-and-play' || settings.mode === 'custom' ? null : playerColor;

  const modeLabel = settings.mode === 'pass-and-play' ? 'same screen'
    : settings.mode === 'bot' ? 'vs computer'
    : settings.mode === 'custom' ? 'custom'
    : 'online';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column', fontFamily: '"DM Sans", sans-serif' }}>

      {/* Top accent bar */}
      <div style={{ height: 3, background: C.red, flexShrink: 0 }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 44, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <button
          onClick={() => setLocation('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.75rem',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: C.sub, padding: '4px 0',
          }}
        >
          ← Back
        </button>
        <span style={{
          fontFamily: '"Anton", impact, sans-serif', fontSize: '1.3rem',
          letterSpacing: '0.08em', color: C.text,
        }}>
          GAMBIT
        </span>
        <span style={{
          fontFamily: '"DM Sans", sans-serif', fontSize: '0.68rem',
          fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: C.dim, width: 72, textAlign: 'right',
        }}>
          {modeLabel}
        </span>
      </div>

      {/* Game layout */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12,
      }}>
        <PlayerBar
          color="b"
          state={state}
          isActive={state.turn === 'b' && !gameOver.isOver}
          botThinking={botThinking && settings.mode === 'bot' && state.turn === 'b'}
        />

        <ChessBoard
          chess={chess}
          state={state}
          selectedSquare={selectedSquare}
          legalMoves={legalMoves}
          onSquareClick={handleSquareClick}
          playerColor={boardOrientation}
          effectTargeting={effectTargeting}
        />

        <PlayerBar
          color="w"
          state={state}
          isActive={state.turn === 'w' && !gameOver.isOver}
          botThinking={botThinking && settings.mode === 'bot' && state.turn === 'w'}
        />
      </div>

      {/* Spin wheel */}
      {pendingSpin !== null &&
        (settings.mode !== 'bot' || pendingSpin === playerColor) && (
          <SpinWheel
            spinningFor={pendingSpin}
            enabledEffects={settings.enabledEffects}
            onEffect={effect => {
              initiateEffect(effect, pendingSpin);
              setPendingSpin(null);
            }}
          />
        )}

      {/* Effect targeting banner */}
      {effectTargeting && (
        <div style={{ position: 'fixed', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
          <div style={{
            background: C.red, color: '#fff',
            padding: '10px 20px',
            fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', gap: 12,
            pointerEvents: 'auto',
            borderRadius: 0,
          }}>
            <span>🎯 Select target for <strong>{EFFECTS[effectTargeting.effect as EffectType]?.label}</strong></span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 900, fontSize: '1rem' }}
              onClick={() => setEffectTargeting(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver.isOver && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: C.surface,
            borderTop: `3px solid ${C.red}`,
            padding: '40px 36px',
            width: '100%', maxWidth: 340, margin: '0 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: 12 }}>
              {gameOver.result?.includes('checkmate') || gameOver.result?.includes('won')
                ? gameOver.result?.includes('White') ? '♔' : '♚'
                : '½'}
            </div>
            <h2 style={{
              fontFamily: '"Anton", impact, sans-serif',
              fontSize: '2.2rem', letterSpacing: '0.06em',
              color: C.red, margin: '0 0 8px',
              textTransform: 'uppercase',
            }}>
              Game Over
            </h2>
            <p style={{ fontSize: '0.88rem', color: C.sub, marginBottom: 28, lineHeight: 1.5 }}>
              {gameOver.result}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1, padding: '13px 0',
                  fontFamily: '"Anton", impact, sans-serif',
                  fontSize: '1.1rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: C.red, color: '#fff',
                  border: 'none', borderRadius: 0, cursor: 'pointer',
                }}
              >
                Again
              </button>
              <button
                onClick={() => setLocation('/')}
                style={{
                  flex: 1, padding: '13px 0',
                  fontFamily: '"Anton", impact, sans-serif',
                  fontSize: '1.1rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'transparent', color: C.sub,
                  border: `1px solid ${C.border}`, borderRadius: 0, cursor: 'pointer',
                }}
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Player HUD ─────────────────────────────────────────────────────────── */

function PlayerBar({
  color, state, isActive, botThinking,
}: {
  color: Color;
  state: GambitState;
  isActive: boolean;
  botThinking: boolean;
}) {
  const effects = state.activeEffects[color];
  const captured = state.capturedPieces.filter(p => p.color !== color);
  const movesLeft = state.spinProgress[color];
  const spinMax = 5; // approximate for bar width

  return (
    <div style={{
      width: '100%', maxWidth: 520,
      background: isActive ? 'rgba(247,47,34,0.05)' : C.surface,
      border: `1px solid ${isActive ? C.red : C.border}`,
      borderLeft: `3px solid ${isActive ? C.red : C.border}`,
      padding: '10px 12px',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>{color === 'w' ? '♔' : '♚'}</span>
          <span style={{ fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.02em' }}>
            {color === 'w' ? 'WHITE' : 'BLACK'}
          </span>
          {botThinking && (
            <span style={{ fontSize: '0.68rem', color: C.red, fontFamily: '"JetBrains Mono", monospace' }}
              className="animate-strobe">
              THINKING
            </span>
          )}
          {isActive && !botThinking && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }}
              className="animate-strobe" />
          )}
        </div>

        {/* Spin countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.68rem', color: C.sub, fontFamily: '"JetBrains Mono", monospace' }}>
            🎰 {movesLeft}
          </span>
          <div style={{ width: 48, height: 3, background: C.dim }}>
            <div
              style={{
                height: '100%', background: C.red,
                width: `${Math.max(0, 100 - (movesLeft / spinMax) * 100)}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      </div>

      {/* Active effects */}
      {effects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
          {effects.map(e => (
            <span
              key={e.id}
              style={{
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.68rem', fontWeight: 700,
                padding: '2px 7px',
                background: EFFECTS[e.type]?.category === 'buff' ? 'rgba(33,212,126,0.12)' : 'rgba(247,47,34,0.12)',
                color: EFFECTS[e.type]?.category === 'buff' ? C.green : C.nerf,
                border: `1px solid ${EFFECTS[e.type]?.category === 'buff' ? 'rgba(33,212,126,0.3)' : 'rgba(247,47,34,0.3)'}`,
                letterSpacing: '0.04em',
              }}
            >
              {EFFECTS[e.type]?.label} ×{e.duration}
            </span>
          ))}
        </div>
      )}

      {/* Captured pieces */}
      {captured.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: C.sub, marginTop: 5, opacity: 0.7 }}>
          {captured.map((p, i) => <span key={i}>{PIECE_SYMBOLS[p.type]}</span>)}
        </div>
      )}
    </div>
  );
}
