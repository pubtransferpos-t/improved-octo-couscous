import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Color, Move, PieceSymbol, Square } from 'chess.js';
import { useGambitGame, useOnlineMatch, GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { EFFECTS, EffectType, GambitState, HeldAbility } from '@/hooks/gambit-engine';
import ChessBoard from '@/components/chess-board';
import SpinWheel from '@/components/spin-wheel';
import RpsOverlay from '@/components/rps-overlay';
import AdminPanel from '@/components/admin-panel';
import { getGameSettings } from './home';

// Admin secret is verified server-side — not stored in client code.

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export default function Game() {
  const [, setLocation] = useLocation();

  const settings: GameSettings = (() => {
    try { return getGameSettings(); } catch { return DEFAULT_SETTINGS; }
  })();

  const onlineMatch = useOnlineMatch(settings);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [playerColor, setPlayerColor] = useState<Color>(() =>
    settings.playerColor === 'random'
      ? Math.random() < 0.5 ? 'w' : 'b'
      : settings.playerColor as Color,
  );

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [spinGen, setSpinGen] = useState(0);
  const [botThinking, setBotThinking] = useState(false);
  const botScheduled = useRef(false);

  // ── Admin panel ──────────────────────────────────────────────────────────
  // Never trust client-side storage for auth state — always derive from server.
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [adminError, setAdminError] = useState('');

  // On mount: silently auto-unlock if this device's IP is on the allowlist.
  useEffect(() => {
    fetch('/api/admin/access')
      .then(r => r.json())
      .then((data: { allowed: boolean }) => { if (data.allowed) setAdminUnlocked(true); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    state, chess, pendingSpin, resolveCurrentSpin,
    gameOver, makeMove, getLegalMoves,
    initiateEffect, activateHeldAbility, effectTargeting, setEffectTargeting, handleTargetClick,
    forceSync, syncCooldown, resolveRps, selectWeightedEffect,
    triggerSpin, loadFen, forceSetTurn, clearPlayerEffects, setSpinProgress,
    spawnPiece, riggedSpins, setRiggedSpin,
  } = useGambitGame(settings, onlineMatch);

  // Keep a ref to riggedSpins so the pendingSpin effect can read the latest value without re-running
  const riggedSpinsRef = useRef(riggedSpins);
  useEffect(() => { riggedSpinsRef.current = riggedSpins; }, [riggedSpins]);

  // Auto-apply rigged spin when pendingSpin fires (before SpinWheel renders)
  useEffect(() => {
    if (pendingSpin === null) return;
    const rigged = riggedSpinsRef.current[pendingSpin];
    if (!rigged) return;
    setRiggedSpin(pendingSpin, null);
    initiateEffect(rigged, pendingSpin);
    resolveCurrentSpin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpin]);

  useEffect(() => {
    if (settings.mode === 'online' && onlineMatch.status === 'matched' && onlineMatch.color) {
      setPlayerColor(onlineMatch.color);
    }
  }, [settings.mode, onlineMatch.status, onlineMatch.color]);

  // ── Admin panel keyboard shortcut (Shift+Alt+X) ───────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault();
        if (adminUnlocked) {
          setShowAdmin(v => !v);
          return;
        }
        // Try IP allowlist first; fall back to password prompt
        fetch('/api/admin/access')
          .then(r => r.json())
          .then((data: { allowed: boolean }) => {
            if (data.allowed) {
              setAdminUnlocked(true);
              setShowAdmin(true);
            } else {
              setAdminPrompt(true);
            }
          })
          .catch(() => setAdminPrompt(true));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [adminUnlocked]);

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
    // If a rigged spin is queued for this color, the rigged-spin effect handles it — don't double-apply.
    if (riggedSpinsRef.current[pendingSpin]) return;
    const timer = setTimeout(() => {
      // Filter out holdable effects for bot — bot can't use held abilities
      const pool = settings.enabledEffects.filter(e => !EFFECTS[e].holdable);
      if (pool.length > 0) {
        const chosen = selectWeightedEffect(pool);
        initiateEffect(chosen, pendingSpin, true); // forceApply=true skips holdable routing
      }
      resolveCurrentSpin();
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
    <div style={{ height: '100dvh', overflow: 'hidden', background: '#0d0a1a', color: '#f0f0ff', display: 'flex', flexDirection: 'column', fontFamily: '"Boogaloo", sans-serif' }}>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 72, justifyContent: 'flex-end' }}>
          <span style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.42rem',
            color: 'rgba(200,190,255,0.35)', letterSpacing: '0.08em',
            textTransform: 'uppercase', textAlign: 'right',
          }}>
            {settings.mode.replace('-', ' ')}
          </span>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            style={{
              background: 'rgba(191,95,255,0.12)', border: '1px solid rgba(191,95,255,0.35)',
              borderRadius: 7, cursor: 'pointer', color: 'rgba(191,95,255,0.8)',
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s', fontSize: '0.9rem', padding: 0,
            }}
          >
            {isFullscreen ? '⊠' : '⊡'}
          </button>
        </div>
      </div>

      {/* Game layout */}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12,
        overflowY: 'auto',
      }}>
        <PlayerBar
          color="b"
          state={state}
          isActive={state.turn === 'b' && !gameOver.isOver}
          botThinking={botThinking && settings.mode === 'bot' && state.turn === 'b'}
          isLocalPlayer={isOnline && playerColor === 'b'}
          forceSync={isOnline && playerColor === 'b' ? forceSync : undefined}
          syncCooldown={isOnline && playerColor === 'b' ? syncCooldown : 0}
          canActivateHeld={
            state.turn === 'b' && !gameOver.isOver && pendingSpin === null && effectTargeting === null &&
            (settings.mode !== 'bot' || playerColor === 'b')
          }
          onActivateHeld={(id, type) => activateHeldAbility(id, type, 'b')}
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
          canActivateHeld={
            state.turn === 'w' && !gameOver.isOver && pendingSpin === null && effectTargeting === null &&
            (settings.mode !== 'bot' || playerColor === 'w')
          }
          onActivateHeld={(id, type) => activateHeldAbility(id, type, 'w')}
        />

        {/* Illegal move button */}
        {state.illegalMoveAvailable[playerColor] && state.turn === playerColor && !gameOver.isOver && (
          <div style={{
            fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem',
            color: '#ff2d78', background: 'rgba(255,45,120,0.12)',
            border: '2px solid rgba(255,45,120,0.5)', borderRadius: 10,
            padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
            animation: 'bob 1.5s ease-in-out infinite',
          }}>
            🚨 <span>You may make <strong>1 illegal move</strong> — drag any piece anywhere!</span>
          </div>
        )}

        {/* Stockfish elo display */}
        {state.stockfishElo[playerColor] !== null && state.stockfishElo[playerColor] !== undefined && (
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
            color: '#39ff14', background: 'rgba(57,255,20,0.08)',
            border: '1px solid rgba(57,255,20,0.3)', borderRadius: 10,
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🧠 STOCKFISH ADVISOR {state.stockfishElo[playerColor]} ELO
            {(state.stockfishElo[playerColor] ?? 0) <= 600 && <span style={{ color: '#ff9900' }}>(RETIRED)</span>}
          </div>
        )}
      </div>

      {/* Spin wheel — skip if admin has rigged this spin (auto-applied via useEffect) */}
      {pendingSpin !== null && !riggedSpins[pendingSpin] && (settings.mode !== 'bot' || pendingSpin === playerColor) && (
        <SpinWheel
          key={`spin-${spinGen}`}
          spinningFor={pendingSpin}
          enabledEffects={settings.enabledEffects}
          onEffect={effect => { initiateEffect(effect, pendingSpin); setSpinGen(g => g + 1); resolveCurrentSpin(); }}
        />
      )}

      {/* RPS mini-game overlay */}
      {state.rpsPending !== null && (
        <RpsOverlay
          challenger={state.rpsPending}
          onResult={resolveRps}
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

      {/* Admin password prompt */}
      {adminPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 190,
          background: 'rgba(5,2,20,0.92)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="animate-bounce-in" style={{
            width: '100%', maxWidth: 340, padding: '28px 24px',
            background: 'linear-gradient(145deg, #14102a, #1a1230)',
            border: '2px solid rgba(255,45,120,0.5)', borderRadius: 20,
            textAlign: 'center',
            boxShadow: '0 0 50px rgba(255,45,120,0.3)',
          }}>
            <div style={{
              fontFamily: '"Permanent Marker", cursive', fontSize: '1.4rem',
              color: '#ff2d78', marginBottom: 14,
              filter: 'drop-shadow(0 0 8px rgba(255,45,120,0.5))',
            }}>🛠 Admin Access</div>
            <input
              type="password"
              value={adminInput}
              onChange={e => setAdminInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  fetch('/api/admin/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: adminInput }),
                  })
                    .then(r => r.json())
                    .then((data: { allowed: boolean }) => {
                      if (data.allowed) {
                        setAdminUnlocked(true);
                        setAdminPrompt(false);
                        setShowAdmin(true);
                        setAdminInput('');
                        setAdminError('');
                      } else {
                        setAdminError('Wrong password');
                      }
                    })
                    .catch(() => setAdminError('Server error'));
                }
              }}
              placeholder="Enter admin password…"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem',
                background: 'rgba(0,0,0,0.5)', borderRadius: 8,
                border: '1px solid rgba(191,95,255,0.4)',
                color: '#f0f0ff', marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            {adminError && (
              <div style={{ color: '#ff2d78', fontSize: '0.85rem', marginBottom: 8 }}>{adminError}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  fetch('/api/admin/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: adminInput }),
                  })
                    .then(r => r.json())
                    .then((data: { allowed: boolean }) => {
                      if (data.allowed) {
                        setAdminUnlocked(true);
                        setAdminPrompt(false);
                        setShowAdmin(true);
                        setAdminInput('');
                        setAdminError('');
                      } else {
                        setAdminError('Wrong password');
                      }
                    })
                    .catch(() => setAdminError('Server error'));
                }}
                style={{
                  flex: 1, padding: '10px 0',
                  fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem',
                  background: 'rgba(255,45,120,0.2)', color: '#ff2d78',
                  border: '1px solid rgba(255,45,120,0.4)', borderRadius: 10,
                  cursor: 'pointer',
                }}
              >Unlock</button>
              <button
                onClick={() => { setAdminPrompt(false); setAdminInput(''); setAdminError(''); }}
                style={{
                  flex: 1, padding: '10px 0',
                  fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem',
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(200,190,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  cursor: 'pointer',
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin panel */}
      {adminUnlocked && showAdmin && (
        <AdminPanel
          state={state}
          currentTurn={state.turn}
          onForceEffect={(effect, color) => initiateEffect(effect, color)}
          onForceSpin={triggerSpin}
          onLoadFen={loadFen}
          onSetSpinProgress={setSpinProgress}
          onClearEffects={clearPlayerEffects}
          onForceTurn={forceSetTurn}
          onClose={() => setShowAdmin(false)}
          onSpawnPiece={spawnPiece}
          onRigSpin={setRiggedSpin}
          riggedSpins={riggedSpins}
        />
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
  onActivateHeld, canActivateHeld,
}: {
  color: Color;
  state: GambitState;
  isActive: boolean;
  botThinking: boolean;
  isLocalPlayer?: boolean;
  forceSync?: () => void;
  syncCooldown?: number;
  onActivateHeld?: (id: string, type: EffectType) => void;
  canActivateHeld?: boolean;
}) {
  const effects = state.activeEffects[color];
  const held = state.heldAbilities[color] ?? [];
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

      {/* Held abilities hand */}
      {held.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
            color: 'rgba(200,190,255,0.4)', letterSpacing: '0.08em',
            marginBottom: 5, textTransform: 'uppercase',
          }}>
            🃏 Hand ({held.length}/5)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {held.map((a: HeldAbility) => {
              const def = EFFECTS[a.type];
              const isBuff = def?.category === 'buff';
              const glowColor = isBuff ? '#39ff14' : '#bf5fff';
              const canUse = !!canActivateHeld;
              return (
                <button
                  key={a.id}
                  disabled={!canUse}
                  onClick={() => onActivateHeld?.(a.id, a.type)}
                  title={`${def?.label}: ${def?.description}${canUse ? '\n\nClick to activate!' : '\n\n(not your turn)'}`}
                  style={{
                    fontFamily: '"Boogaloo", sans-serif', fontSize: '0.82rem',
                    padding: '3px 10px', borderRadius: 20,
                    background: canUse
                      ? (isBuff ? 'rgba(57,255,20,0.18)' : 'rgba(191,95,255,0.18)')
                      : 'rgba(255,255,255,0.04)',
                    color: canUse ? glowColor : 'rgba(200,190,255,0.35)',
                    border: `1px solid ${canUse ? glowColor + '55' : 'rgba(255,255,255,0.1)'}`,
                    boxShadow: canUse ? `0 0 10px ${glowColor}33` : 'none',
                    cursor: canUse ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 4,
                    animation: canUse ? 'bob 2s ease-in-out infinite' : 'none',
                  }}
                >
                  <span>{def?.emoji}</span>
                  <span>{def?.label}</span>
                </button>
              );
            })}
          </div>
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
