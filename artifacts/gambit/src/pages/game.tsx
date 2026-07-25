import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Color, Move, PieceSymbol, Square } from 'chess.js';
import { useGambitGame, useOnlineMatch, GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType, GambitState } from '@/hooks/gambit-engine';
import ChessBoard from '@/components/chess-board';
import SpinWheel from '@/components/spin-wheel';
import { getGameSettings } from './home';

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export default function Game() {
  const [, setLocation] = useLocation();

  const settings: GameSettings = (() => {
    try { return getGameSettings(); } catch { return DEFAULT_SETTINGS; }
  })();

  const onlineMatch = useOnlineMatch(settings);
  const [playerColor, setPlayerColor] = useState<Color>(() =>
    settings.playerColor === 'random'
      ? Math.random() < 0.5 ? 'w' : 'b'
      : settings.playerColor as Color,
  );

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const botScheduled = useRef(false);

  const {
    state, chess, pendingSpin, setPendingSpin,
    gameOver, makeMove, getLegalMoves,
    initiateEffect, effectTargeting, setEffectTargeting, handleTargetClick,
    forceSync, syncCooldown,
  } = useGambitGame(settings, onlineMatch);

  useEffect(() => {
    if (settings.mode === 'online' && onlineMatch.status === 'matched' && onlineMatch.color) {
      setPlayerColor(onlineMatch.color);
    }
  }, [settings.mode, onlineMatch.status, onlineMatch.color]);

  // ── Bot AI ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.mode !== 'bot') { console.log('[bot-effect] skip: not bot mode'); return; }
    if (state.turn === playerColor) { console.log('[bot-effect] skip: player turn', state.turn); return; }
    if (gameOver.isOver) { console.log('[bot-effect] skip: game over'); return; }
    if (pendingSpin !== null) { console.log('[bot-effect] skip: pendingSpin', pendingSpin); return; }
    if (effectTargeting !== null) { console.log('[bot-effect] skip: effectTargeting active'); return; }
    if (botScheduled.current) { console.log('[bot-effect] skip: already scheduled'); return; }

    botScheduled.current = true;
    setBotThinking(true);
    const filteredMoves = getLegalMoves();

    const timer = setTimeout(async () => {
      const { getBotMove } = await import('@/lib/bot');
      const move = getBotMove(state.fen, settings.botElo, filteredMoves);
      if (move) makeMove({ from: move.from, to: move.to, promotion: move.promotion });
      setBotThinking(false);
      botScheduled.current = false;
    }, 450);
    return () => { clearTimeout(timer); botScheduled.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.fen, gameOver.isOver, pendingSpin, effectTargeting]);

  // ── Bot auto-spin ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.mode !== 'bot' || pendingSpin === null || pendingSpin === playerColor) return;
    const timer = setTimeout(() => {
      const pool = settings.enabledEffects;
      if (pool.length > 0) initiateEffect(pool[Math.floor(Math.random() * pool.length)], pendingSpin);
      setPendingSpin(null);
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpin]);

  useEffect(() => { setSelectedSquare(null); setLegalMoves([]); }, [state.turn]);

  const handleSquareClick = useCallback((sq: Square) => {
    if (effectTargeting) { handleTargetClick(sq); return; }
    if (settings.mode === 'bot' && state.turn !== playerColor) return;

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
    const canControl =
      settings.mode === 'pass-and-play' || settings.mode === 'custom'
        ? piece?.color === state.turn
        : piece?.color === playerColor && piece.color === state.turn;

    if (canControl) {
      if (selectedSquare === sq) { setSelectedSquare(null); setLegalMoves([]); }
      else { setSelectedSquare(sq); setLegalMoves(getLegalMoves(sq)); }
    } else { setSelectedSquare(null); setLegalMoves([]); }
  }, [effectTargeting, handleTargetClick, selectedSquare, legalMoves, chess, state.turn, makeMove, getLegalMoves, settings.mode, playerColor]);

  // Keep this conditional render after every hook so the component has the
  // same hook order while a player transitions from waiting to matched.
  if (
    settings.mode === 'online' &&
    (onlineMatch.status !== 'matched' || playerColor !== onlineMatch.color)
  ) {
    return (
      <MatchmakingScreen
        match={onlineMatch}
        onCancel={() => setLocation('/')}
      />
    );
  }

  const boardOrientation: Color | null =
    settings.mode === 'pass-and-play' || settings.mode === 'custom' ? null : playerColor;

  const isOnline = settings.mode === 'online';

  return (
    <div style={{ minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff', display: 'flex', flexDirection: 'column', fontFamily: '"Boogaloo", sans-serif' }}>

      {/* Rainbow top bar */}
      <div style={{
        height: 5, flexShrink: 0,
        background: 'linear-gradient(90deg, #ff2d78, #ff9900, #ffee00, #39ff14, #00f5ff, #bf5fff, #ff2d78)',
        backgroundSize: '200% 100%',
        animation: 'rainbow 3s linear infinite',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 50,
        borderBottom: '1px solid rgba(191,95,255,0.2)',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
      }}>
        <button
          onClick={() => setLocation('/')}
          style={{
            background: 'rgba(255,45,120,0.15)', border: '1px solid rgba(255,45,120,0.4)',
            borderRadius: 8, cursor: 'pointer',
            fontFamily: '"Boogaloo", sans-serif', fontWeight: 400, fontSize: '1rem',
            color: '#ff2d78', padding: '4px 12px',
            transition: 'all 0.15s',
          }}
        >
          ← Back
        </button>
        <span style={{
          fontFamily: '"Permanent Marker", cursive',
          fontSize: '1.5rem',
          background: 'linear-gradient(135deg, #ff2d78, #ff9900, #ffee00)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 10px rgba(255,45,120,0.5))',
        }}>
          Gambit
        </span>
        <span style={{
          fontFamily: '"Press Start 2P", monospace', fontSize: '0.42rem',
          color: 'rgba(200,190,255,0.35)', letterSpacing: '0.08em',
          textTransform: 'uppercase', width: 72, textAlign: 'right',
        }}>
          {settings.mode.replace('-', ' ')}
        </span>
      </div>

      {/* Game layout */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12,
      }}>
        <PlayerBar
          color="b"
          state={state}
          isActive={state.turn === 'b' && !gameOver.isOver}
          botThinking={botThinking && settings.mode === 'bot' && state.turn === 'b'}
          isLocalPlayer={isOnline && playerColor === 'b'}
          forceSync={isOnline && playerColor === 'b' ? forceSync : undefined}
          syncCooldown={isOnline && playerColor === 'b' ? syncCooldown : 0}
        />

        <ChessBoard
          chess={chess}
          state={state}
          selectedSquare={selectedSquare}
          legalMoves={legalMoves}
          lastMove={null}
          onSquareClick={handleSquareClick}
          playerColor={boardOrientation}
          effectTargeting={effectTargeting}
        />

        <PlayerBar
          color="w"
          state={state}
          isActive={state.turn === 'w' && !gameOver.isOver}
          botThinking={botThinking && settings.mode === 'bot' && state.turn === 'w'}
          isLocalPlayer={isOnline && playerColor === 'w'}
          forceSync={isOnline && playerColor === 'w' ? forceSync : undefined}
          syncCooldown={isOnline && playerColor === 'w' ? syncCooldown : 0}
        />
      </div>

      {/* Spin wheel */}
      {pendingSpin !== null && (settings.mode !== 'bot' || pendingSpin === playerColor) && (
        <SpinWheel
          spinningFor={pendingSpin}
          enabledEffects={settings.enabledEffects}
          onEffect={effect => { initiateEffect(effect, pendingSpin); setPendingSpin(null); }}
        />
      )}

      {/* Effect targeting banner */}
      {effectTargeting && (
        <div style={{ position: 'fixed', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, #ff2d78, #ff9900)',
            color: '#fff', padding: '12px 24px', borderRadius: 50,
            fontFamily: '"Boogaloo", sans-serif', fontSize: '1.1rem',
            display: 'flex', alignItems: 'center', gap: 12,
            pointerEvents: 'auto',
            boxShadow: '0 0 30px rgba(255,45,120,0.5), 0 8px 24px rgba(0,0,0,0.4)',
            animation: 'bob 1.5s ease-in-out infinite',
          }}>
            <span>🎯 Pick a target for <strong>{EFFECTS[effectTargeting.effect as EffectType]?.label}</strong></span>
            <button
              style={{ background: 'rgba(0,0,0,0.25)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setEffectTargeting(null)}
            >✕</button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver.isOver && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div className="animate-bounce-in" style={{
            background: 'linear-gradient(145deg, #14102a, #1a1230)',
            border: '3px solid transparent',
            backgroundClip: 'padding-box',
            position: 'relative',
            padding: '40px 36px',
            width: '100%', maxWidth: 360, margin: '0 16px',
            textAlign: 'center', borderRadius: 24,
            boxShadow: '0 0 60px rgba(255,45,120,0.3), 0 20px 60px rgba(0,0,0,0.6)',
          }}>
            {/* Rainbow border trick */}
            <div style={{
              position: 'absolute', inset: -3, borderRadius: 26, zIndex: -1,
              background: 'linear-gradient(135deg, #ff2d78, #ff9900, #ffee00, #39ff14, #00f5ff, #bf5fff)',
              animation: 'rainbow 3s linear infinite',
            }} />

            <div style={{ fontSize: '4rem', marginBottom: 8 }} className="animate-bob">
              {gameOver.result?.includes('checkmate') || gameOver.result?.includes('won')
                ? gameOver.result?.includes('White') ? '♔' : '♚'
                : '🤝'}
            </div>
            <h2 style={{
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '2.8rem',
              background: 'linear-gradient(135deg, #ff2d78, #ff9900)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              margin: '0 0 8px',
            }}>
              Game Over!
            </h2>
            <p style={{ fontSize: '1rem', fontFamily: '"Boogaloo", sans-serif', color: 'rgba(200,190,255,0.7)', marginBottom: 28 }}>
              {gameOver.result}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1, padding: '14px 0',
                  fontFamily: '"Permanent Marker", cursive', fontSize: '1.4rem',
                  background: 'linear-gradient(135deg, #ff2d78, #ff9900)',
                  color: '#fff', border: 'none', borderRadius: 14,
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(255,45,120,0.4)',
                  transition: 'transform 0.15s',
                }}
              >
                Again! 🎲
              </button>
              <button
                onClick={() => setLocation('/')}
                style={{
                  flex: 1, padding: '14px 0',
                  fontFamily: '"Boogaloo", sans-serif', fontSize: '1.2rem',
                  background: 'rgba(191,95,255,0.15)',
                  color: '#bf5fff', border: '2px solid rgba(191,95,255,0.4)',
                  borderRadius: 14, cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
              >
                🏠 Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchmakingScreen({ match, onCancel }: {
  match: ReturnType<typeof useOnlineMatch>;
  onCancel: () => void;
}) {
  const isError = match.status === 'error';
  return (
    <div style={{
      minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: '"Boogaloo", sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, textAlign: 'center',
        background: 'linear-gradient(145deg, #14102a, #1a1230)',
        border: `2px solid ${isError ? '#ff2d78' : '#bf5fff'}`,
        borderRadius: 24, padding: '42px 28px',
        boxShadow: `0 0 50px ${isError ? 'rgba(255,45,120,0.22)' : 'rgba(191,95,255,0.25)'}`,
      }}>
        <div style={{ fontSize: '4rem', marginBottom: 6 }}>{isError ? '⚠' : '♞'}</div>
        <h1 style={{
          fontFamily: '"Permanent Marker", cursive', fontSize: '2.35rem',
          margin: '0 0 12px',
          background: 'linear-gradient(135deg, #bf5fff, #00f5ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {isError ? 'Matchmaking Error' : 'Finding your rival…'}
        </h1>
        <p style={{ color: 'rgba(220,210,255,0.72)', fontSize: '1.15rem', margin: '0 0 22px' }}>
          {match.message}
        </p>
        {!isError && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            color: '#39ff14', fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.52rem', letterSpacing: '0.06em',
            background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.25)',
            borderRadius: 20, padding: '10px 14px', marginBottom: 28,
          }}>
            <span className="animate-blink" style={{ width: 8, height: 8, borderRadius: '50%', background: '#39ff14' }} />
            {match.playersOnline} PLAYER{match.playersOnline === 1 ? '' : 'S'} ONLINE
          </div>
        )}
        <div>
          <button onClick={onCancel} style={{
            padding: '12px 24px', borderRadius: 12, cursor: 'pointer',
            fontFamily: '"Boogaloo", sans-serif', fontSize: '1.1rem',
            color: '#bf5fff', background: 'rgba(191,95,255,0.12)',
            border: '2px solid rgba(191,95,255,0.4)',
          }}>
            ← Leave queue
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Player HUD ─────────────────────────────────────────────────────────── */

const PLAYER_COLORS = { w: '#ffee00', b: '#00f5ff' };

function PlayerBar({
  color, state, isActive, botThinking,
  isLocalPlayer, forceSync, syncCooldown,
}: {
  color: Color;
  state: GambitState;
  isActive: boolean;
  botThinking: boolean;
  isLocalPlayer?: boolean;
  forceSync?: () => void;
  syncCooldown?: number;
}) {
  const effects = state.activeEffects[color];
  const captured = state.capturedPieces.filter(p => p.color !== color);
  const movesLeft = state.spinProgress[color];
  const pc = PLAYER_COLORS[color];

  const onCooldown = (syncCooldown ?? 0) > 0;

  return (
    <div style={{
      width: '100%', maxWidth: 520,
      background: isActive ? `${pc}0f` : 'rgba(255,255,255,0.02)',
      border: `2px solid ${isActive ? pc : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14,
      padding: '10px 14px',
      boxShadow: isActive ? `0 0 20px ${pc}44` : 'none',
      transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: player identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.2rem', filter: isActive ? `drop-shadow(0 0 8px ${pc})` : 'none' }}>
            {color === 'w' ? '♔' : '♚'}
          </span>
          <span style={{
            fontFamily: '"Boogaloo", sans-serif', fontWeight: 400, fontSize: '1rem',
            color: isActive ? pc : 'rgba(200,190,255,0.6)',
          }}>
            {color === 'w' ? 'White' : 'Black'}
            {isLocalPlayer && (
              <span style={{
                marginLeft: 6,
                fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
                color: pc, opacity: 0.7, verticalAlign: 'middle',
              }}>YOU</span>
            )}
          </span>
          {botThinking && (
            <span style={{
              fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem',
              color: pc,
            }} className="animate-blink">THINKING</span>
          )}
          {isActive && !botThinking && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: pc,
              boxShadow: `0 0 8px ${pc}`,
              display: 'inline-block',
            }} className="animate-blink" />
          )}

          {/* Problem button — only shown for the local player in online mode */}
          {isLocalPlayer && forceSync && (
            <button
              onClick={forceSync}
              disabled={onCooldown}
              title={onCooldown
                ? `Sync available in ${syncCooldown}s`
                : 'Something look wrong? Force a sync with the server'}
              style={{
                marginLeft: 4,
                padding: '2px 8px',
                fontFamily: '"Boogaloo", sans-serif', fontSize: '0.78rem',
                background: onCooldown
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,153,0,0.15)',
                border: `1px solid ${onCooldown ? 'rgba(255,255,255,0.12)' : 'rgba(255,153,0,0.45)'}`,
                borderRadius: 8,
                color: onCooldown ? 'rgba(200,190,255,0.3)' : '#ff9900',
                cursor: onCooldown ? 'default' : 'pointer',
                transition: 'all 0.15s',
                lineHeight: 1.4,
              }}
            >
              {onCooldown ? `⏳ ${syncCooldown}s` : '⚠ Problem?'}
            </button>
          )}
        </div>

        {/* Right: spin countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: '"VT323", monospace', fontSize: '1.1rem', color: 'rgba(200,190,255,0.5)' }}>
            🎰 {movesLeft}
          </span>
          <div style={{ width: 52, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${pc}, ${pc}aa)`,
              width: `${Math.max(0, 100 - (movesLeft / 5) * 100)}%`,
              transition: 'width 0.3s',
              boxShadow: `0 0 6px ${pc}`,
            }} />
          </div>
        </div>
      </div>

      {/* Active effects */}
      {effects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
          {effects.map(e => {
            const isBuff = EFFECTS[e.type]?.category === 'buff';
            return (
              <span key={e.id} style={{
                fontFamily: '"Boogaloo", sans-serif', fontSize: '0.82rem',
                padding: '2px 9px', borderRadius: 20,
                background: isBuff ? 'rgba(57,255,20,0.13)' : 'rgba(255,45,120,0.13)',
                color: isBuff ? '#39ff14' : '#ff2d78',
                border: `1px solid ${isBuff ? 'rgba(57,255,20,0.35)' : 'rgba(255,45,120,0.35)'}`,
                boxShadow: `0 0 8px ${isBuff ? 'rgba(57,255,20,0.2)' : 'rgba(255,45,120,0.2)'}`,
              }}>
                {EFFECTS[e.type]?.label} ×{e.duration}
              </span>
            );
          })}
        </div>
      )}

      {captured.length > 0 && (
        <div style={{ fontSize: '0.85rem', color: 'rgba(200,190,255,0.4)', marginTop: 5 }}>
          {captured.map((p, i) => <span key={i}>{PIECE_SYMBOLS[p.type]}</span>)}
        </div>
      )}
    </div>
  );
}
