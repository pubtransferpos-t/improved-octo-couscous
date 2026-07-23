import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Color, Move, PieceSymbol, Square } from 'chess.js';
import { useGambitGame, GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType, GambitState } from '@/hooks/gambit-engine';
import ChessBoard from '@/components/chess-board';
import SpinWheel from '@/components/spin-wheel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getGameSettings } from './home';

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

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

    // Snapshot effect-filtered legal moves NOW (before the async gap).
    const filteredMoves = getLegalMoves();
    console.log('[bot-effect] effect-filtered legal moves:', filteredMoves.length, filteredMoves.map(m => `${m.from}-${m.to}`));

    const timer = setTimeout(async () => {
      console.log('[bot-effect] timeout fired, calling getBotMove');
      const { getBotMove } = await import('@/lib/bot');
      const move = getBotMove(state.fen, settings.botElo, filteredMoves);
      console.log('[bot-effect] getBotMove returned:', move);
      if (move) {
        // Only pass promotion when it's actually a pawn promotion — passing 'q' on
        // every move causes makeMove to reject normal moves that have no promotion field.
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
    if (pendingSpin === playerColor) return; // human's spin — shown in UI
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

    // Block input on bot's turn
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

    // Select a piece
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

  // ── Board orientation ─────────────────────────────────────────────────────
  const boardOrientation: Color | null =
    settings.mode === 'pass-and-play' || settings.mode === 'custom' ? null : playerColor;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/')}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Menu
        </Button>
        <span className="text-amber-400 font-black font-serif text-xl tracking-tight">GAMBIT</span>
        <span className="text-xs text-gray-500 capitalize w-16 text-right">{settings.mode.replace('-', ' ')}</span>
      </div>

      {/* Game layout */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-3">
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

      {/* Spin wheel (human's spin only) */}
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
        <div className="fixed bottom-4 inset-x-0 flex justify-center z-40 pointer-events-none">
          <div className="bg-amber-400 text-gray-900 px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl flex items-center gap-3 pointer-events-auto">
            <span>🎯 Select target for <strong>{EFFECTS[effectTargeting.effect as EffectType]?.label}</strong></span>
            <button
              className="text-gray-700 hover:text-gray-900 font-bold"
              onClick={() => setEffectTargeting(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver.isOver && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-5xl mb-3">
              {gameOver.result?.includes('checkmate') || gameOver.result?.includes('won')
                ? gameOver.result?.includes('White') ? '♔' : '♚'
                : '🤝'}
            </div>
            <h2 className="text-2xl font-bold text-amber-400 mb-2">Game Over</h2>
            <p className="text-gray-300 mb-6">{gameOver.result}</p>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold"
                onClick={() => window.location.reload()}
              >
                Play Again
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:text-white"
                onClick={() => setLocation('/')}
              >
                Menu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Player HUD bar ────────────────────────────────────────────────────────────

function PlayerBar({
  color,
  state,
  isActive,
  botThinking,
}: {
  color: Color;
  state: GambitState;
  isActive: boolean;
  botThinking: boolean;
}) {
  const effects = state.activeEffects[color];
  const captured = state.capturedPieces.filter(p => p.color !== color);
  const movesLeft = state.spinProgress[color];

  return (
    <div
      className={`w-full max-w-md rounded-xl p-3 transition-all duration-200 ${
        isActive ? 'bg-gray-800 ring-2 ring-amber-400' : 'bg-gray-900/80'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{color === 'w' ? '♔' : '♚'}</span>
          <span className="font-semibold text-sm">{color === 'w' ? 'White' : 'Black'}</span>
          {botThinking && (
            <span className="text-xs text-amber-400 animate-pulse">thinking…</span>
          )}
          {isActive && !botThinking && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </div>

        {/* Spin countdown */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>🎰 in {movesLeft}</span>
          <div className="w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${100 - (movesLeft / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active effects */}
      {effects.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {effects.map(e => (
            <Badge
              key={e.id}
              className={`text-xs px-1.5 py-0 ${
                EFFECTS[e.type]?.category === 'buff'
                  ? 'bg-green-900 text-green-300 border-green-700'
                  : 'bg-red-900 text-red-300 border-red-700'
              }`}
            >
              {EFFECTS[e.type]?.label} ×{e.duration}
            </Badge>
          ))}
        </div>
      )}

      {/* Captured pieces */}
      {captured.length > 0 && (
        <div className="text-sm text-gray-400 mt-1.5 leading-none">
          {captured.map((p, i) => (
            <span key={i} className="opacity-70">
              {PIECE_SYMBOLS[p.type]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
