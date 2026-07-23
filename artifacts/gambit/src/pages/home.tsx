import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';
import { Switch } from '@/components/ui/switch';

/* ── persistent settings store ─────────────────────────────────────────── */
let _settings: GameSettings = { ...DEFAULT_SETTINGS };
export function getGameSettings(): GameSettings { return _settings; }

/* ── constants ──────────────────────────────────────────────────────────── */
const PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];

// Each DVD has its own X+Y animation durations and a neon color
const DVDS = [
  { piece:'♕', color:'#ff2d78', xDur:'7.1s',  yDur:'5.3s',  size:64 },
  { piece:'♞', color:'#00f5ff', xDur:'9.3s',  yDur:'6.7s',  size:58 },
  { piece:'♜', color:'#39ff14', xDur:'6.2s',  yDur:'8.1s',  size:60 },
  { piece:'♝', color:'#bf5fff', xDur:'11.0s', yDur:'7.4s',  size:56 },
  { piece:'♛', color:'#ffee00', xDur:'8.5s',  yDur:'4.9s',  size:62 },
  { piece:'♟', color:'#ff6b00', xDur:'5.8s',  yDur:'9.2s',  size:52 },
];

const MODES = [
  { id: 'bot'           as const, label: '🤖 vs Computer', desc: 'AI with adjustable ELO',   color: '#ff2d78' },
  { id: 'pass-and-play' as const, label: '🫂 Same Screen', desc: 'Two players, one device',  color: '#00f5ff' },
  { id: 'custom'        as const, label: '🎛️ Custom',       desc: 'Hand-pick the modifier pool', color: '#39ff14' },
  { id: 'online'        as const, label: '🌐 Online',       desc: 'Versus someone online',    color: '#bf5fff' },
];

interface Star { id: number; x: number; y: number; }

function eloLabel(elo: number): string {
  if (elo < 400)  return 'Baby 🍼';
  if (elo < 700)  return 'Casual 😎';
  if (elo < 1000) return 'Club Player';
  if (elo < 1300) return 'Intermediate';
  if (elo < 1600) return 'Strong Amateur';
  if (elo < 1900) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2500) return 'FIDE Master';
  if (elo < 2700) return 'Int\'l Master';
  if (elo < 2850) return 'Grandmaster 🏆';
  return 'SUPER-GM 👑';
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<GameSettings>({ ..._settings });
  const [showEffects, setShowEffects] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [flyingPieces, setFlyingPieces] = useState<{ id: number; piece: string; x: number }[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [playHovered, setPlayHovered] = useState(false);
  const [playWiggle, setPlayWiggle] = useState(false);
  const nextId = useRef(0);
  const starId = useRef(0);

  // Auto-wiggle play button every 4s
  useEffect(() => {
    const iv = setInterval(() => {
      setPlayWiggle(true);
      setTimeout(() => setPlayWiggle(false), 700);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const spewPiece = useCallback((e?: React.MouseEvent) => {
    const id = nextId.current++;
    setFlyingPieces(p => [...p.slice(-15), {
      id,
      piece: PIECES[Math.floor(Math.random() * PIECES.length)],
      x: 5 + Math.random() * 88,
    }]);
    setTimeout(() => setFlyingPieces(p => p.filter(fp => fp.id !== id)), 1200);

    // Burst stars from click position
    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      for (let i = 0; i < 6; i++) {
        const sid = starId.current++;
        const angle = (i / 6) * Math.PI * 2;
        setStars(s => [...s, {
          id: sid,
          x: cx + Math.cos(angle) * 30,
          y: cy + Math.sin(angle) * 30,
        }]);
        setTimeout(() => setStars(s => s.filter(st => st.id !== sid)), 700);
      }
    }
  }, []);

  const startGame = () => {
    _settings = settings;
    setLocation('/game');
  };

  const workerUrl = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('gambit_worker_url') ?? '')
    : '';

  return (
    <div style={{ minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff', overflowX: 'hidden', fontFamily: '"Boogaloo", sans-serif' }}>

      {/* ── Bouncing DVDs ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        {DVDS.map((dvd, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: dvd.size, height: dvd.size,
              borderRadius: '50%',
              background: `${dvd.color}22`,
              border: `3px solid ${dvd.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: dvd.size * 0.5,
              color: dvd.color,
              boxShadow: `0 0 20px ${dvd.color}66, 0 0 40px ${dvd.color}33`,
              animation: `dvd-x-${i + 1} ${dvd.xDur} linear alternate infinite,
                           dvd-y-${i + 1} ${dvd.yDur} linear alternate infinite`,
            }}
          >
            {dvd.piece}
          </div>
        ))}

        {/* Spinning decorative rings */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 240, height: 240,
          border: '3px dashed rgba(191,95,255,0.25)',
          borderRadius: '50%',
        }} className="animate-spin-slow" />
        <div style={{
          position: 'absolute', bottom: -40, left: -40,
          width: 180, height: 180,
          border: '3px dashed rgba(0,245,255,0.2)',
          borderRadius: '50%',
        }} className="animate-spin-rev" />
      </div>

      {/* ── Flying pieces overlay ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 60 }}>
        {flyingPieces.map(fp => (
          <span key={fp.id} className="animate-yeet" style={{
            position: 'absolute', left: `${fp.x}%`, bottom: '30%',
            fontSize: '2rem', userSelect: 'none',
            filter: 'drop-shadow(0 0 8px currentColor)',
          }}>
            {fp.piece}
          </span>
        ))}
        {stars.map(st => (
          <div key={st.id} className="animate-star-pop" style={{
            position: 'absolute',
            left: st.x, top: st.y,
            width: 12, height: 12,
            color: DVDS[st.id % DVDS.length].color,
            fontSize: 14, userSelect: 'none',
            transform: 'translate(-50%, -50%)',
          }}>★</div>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 580, margin: '0 auto', padding: '60px 28px 96px' }}>

        {/* ── Title ── */}
        <header style={{ marginBottom: 52, position: 'relative' }}>
          <button
            onClick={spewPiece}
            style={{ display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            aria-label="Gamble Chess"
          >
            {/* Decorative spinning coin behind title */}
            <div style={{
              position: 'absolute', top: -20, left: -24,
              width: 80, height: 80, borderRadius: '50%',
              background: 'conic-gradient(#ff2d78, #ff9900, #ffee00, #39ff14, #00f5ff, #bf5fff, #ff2d78)',
              opacity: 0.35, zIndex: -1,
            }} className="animate-spin-slow" />

            <h1 style={{
              fontFamily: '"Permanent Marker", cursive',
              fontSize: 'clamp(3.2rem, 13vw, 6rem)',
              fontWeight: 400,
              lineHeight: 0.95,
              margin: 0,
              background: 'linear-gradient(135deg, #ff2d78 0%, #ff9900 25%, #ffee00 50%, #39ff14 75%, #00f5ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 20px rgba(255,45,120,0.4))',
            }}>
              Gamble<br />Chess
            </h1>
          </button>

          <p style={{
            marginTop: 18,
            fontFamily: '"Boogaloo", sans-serif',
            fontSize: '1.1rem',
            color: 'rgba(200,190,255,0.7)',
            lineHeight: 1.5,
          }}>
            ♟️ Chess with a <span style={{ color: '#ff2d78' }}>chaotic</span> modifier wheel.
            Spin it. Get weird. Keep playing.
          </p>
        </header>

        {/* ── Mode selection ── */}
        <section style={{ marginBottom: 36 }}>
          <p style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.6rem', letterSpacing: '0.12em', color: 'rgba(200,190,255,0.5)',
            marginBottom: 12, textTransform: 'uppercase',
          }}>
            // MODE
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {MODES.map(mode => {
              const active = settings.mode === mode.id;
              return (
                <ModeCard
                  key={mode.id}
                  label={mode.label}
                  desc={mode.desc}
                  active={active}
                  color={mode.color}
                  onClick={() => setSettings(s => ({ ...s, mode: mode.id }))}
                />
              );
            })}
          </div>
        </section>

        {/* ── Settings ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 44 }}>

          {settings.mode === 'bot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem', color: 'rgba(200,190,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  // Opponent
                </span>
                <span style={{ fontFamily: '"VT323", monospace', fontSize: '1.4rem', color: '#ff2d78' }}>
                  {settings.botElo}&nbsp;
                  <span style={{ fontSize: '1rem', color: 'rgba(200,190,255,0.5)' }}>{eloLabel(settings.botElo)}</span>
                </span>
              </div>
              <input type="range" min={100} max={2850} step={25}
                value={settings.botElo}
                onChange={e => setSettings(s => ({ ...s, botElo: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: '#ff2d78', cursor: 'pointer', display: 'block' }}
              />
            </div>
          )}

          {settings.mode === 'bot' && (
            <div>
              <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem', color: 'rgba(200,190,255,0.5)', letterSpacing: '0.1em', marginBottom: 10 }}>
                // PLAY AS
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['w', 'b', 'random'] as const).map((c, i) => (
                  <ColorBtn
                    key={c}
                    label={c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random'}
                    active={settings.playerColor === c}
                    color={['#ffee00','#00f5ff','#bf5fff'][i]}
                    onClick={() => setSettings(s => ({ ...s, playerColor: c }))}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem', color: 'rgba(200,190,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                // SPIN EVERY
              </span>
              <span style={{ fontFamily: '"VT323", monospace', fontSize: '1.5rem', color: '#39ff14' }}>
                {settings.spinInterval} moves 🎰
              </span>
            </div>
            <input type="range" min={3} max={10} step={1}
              value={settings.spinInterval}
              onChange={e => setSettings(s => ({ ...s, spinInterval: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: '#39ff14', cursor: 'pointer', display: 'block' }}
            />
          </div>

          {settings.mode === 'custom' && (
            <div>
              <button
                onClick={() => setShowEffects(v => !v)}
                style={{
                  background: 'rgba(191,95,255,0.15)', border: '2px solid #bf5fff',
                  borderRadius: 12, padding: '8px 16px', cursor: 'pointer',
                  fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem',
                  color: '#bf5fff', letterSpacing: '0.04em',
                  transition: 'all 0.15s',
                }}
              >
                {showEffects ? '🔼 Hide effects' : '🎛️ Edit effects'}&nbsp;
                <span style={{ color: 'rgba(200,190,255,0.5)' }}>({settings.enabledEffects.length} on)</span>
              </button>
              {showEffects && (
                <div className="animate-slide-up" style={{
                  marginTop: 14,
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px 20px', maxHeight: 200, overflowY: 'auto',
                  background: 'rgba(191,95,255,0.07)',
                  border: '1px solid rgba(191,95,255,0.2)',
                  borderRadius: 12, padding: 14,
                }}>
                  {(Object.entries(EFFECTS) as [EffectType, typeof EFFECTS[EffectType]][]).map(([id, def]) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <Switch
                        checked={settings.enabledEffects.includes(id)}
                        onCheckedChange={checked =>
                          setSettings(s => ({
                            ...s,
                            enabledEffects: checked
                              ? [...s.enabledEffects, id]
                              : s.enabledEffects.filter(e => e !== id),
                          }))
                        }
                      />
                      <span style={{
                        fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem',
                        color: def.category === 'buff' ? '#39ff14' : '#ff2d78',
                      }}>
                        {def.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {settings.mode === 'online' && (
            <p style={{
              fontFamily: '"VT323", monospace', fontSize: '1.2rem',
              color: workerUrl ? '#39ff14' : '#ff2d78',
              background: workerUrl ? 'rgba(57,255,20,0.08)' : 'rgba(255,45,120,0.08)',
              border: `1px solid ${workerUrl ? 'rgba(57,255,20,0.3)' : 'rgba(255,45,120,0.3)'}`,
              borderRadius: 8, padding: '8px 14px',
            }}>
              {workerUrl ? `✅ ${workerUrl.replace(/https?:\/\//, '').slice(0, 46)}` : '❌ No worker URL set — see below'}
            </p>
          )}
        </section>

        {/* ── Play Button ── */}
        <button
          onClick={startGame}
          onMouseEnter={() => setPlayHovered(true)}
          onMouseLeave={() => setPlayHovered(false)}
          className={playWiggle ? 'animate-wiggle-btn' : ''}
          style={{
            width: '100%', padding: '20px 0',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: '2.2rem',
            background: playHovered
              ? 'linear-gradient(135deg, #ff9900, #ff2d78, #bf5fff)'
              : 'linear-gradient(135deg, #ff2d78, #ff9900, #ffee00)',
            color: '#fff',
            border: 'none', borderRadius: 18,
            cursor: 'pointer',
            boxShadow: playHovered
              ? '0 0 40px rgba(255,45,120,0.7), 0 8px 32px rgba(255,45,120,0.4)'
              : '0 0 20px rgba(255,45,120,0.4), 0 4px 16px rgba(0,0,0,0.4)',
            transform: playHovered ? 'scale(1.03) translateY(-2px)' : 'scale(1)',
            transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
            letterSpacing: '0.04em',
          }}
        >
          🎲 PLAY!
        </button>

        {/* ── Worker URL ── */}
        <div style={{ marginTop: 48 }}>
          <div style={{ height: 1, background: 'rgba(191,95,255,0.2)', marginBottom: 20 }} />
          <button
            onClick={() => setShowWorker(v => !v)}
            style={{
              display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
              letterSpacing: '0.1em', color: 'rgba(200,190,255,0.3)',
            }}
          >
            <span>MULTIPLAYER WORKER URL</span>
            <span>{showWorker ? '▲' : '▼'}</span>
          </button>
          {showWorker && (
            <div style={{ marginTop: 12 }} className="animate-slide-up">
              <input
                type="url"
                placeholder="https://your-worker.workers.dev"
                defaultValue={workerUrl}
                onChange={e => localStorage.setItem('gambit_worker_url', e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px',
                  fontFamily: '"VT323", monospace', fontSize: '1.1rem',
                  background: 'rgba(191,95,255,0.08)',
                  border: '2px solid rgba(191,95,255,0.3)',
                  borderRadius: 8, color: '#f0f0ff', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#bf5fff')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(191,95,255,0.3)')}
              />
              <p style={{
                marginTop: 8, fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem',
                color: 'rgba(200,190,255,0.4)', lineHeight: 1.5,
              }}>
                Free Cloudflare plan: 100k req/day. Polls every 8s. See <code>worker/README.md</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ModeCard({ label, desc, active, color, onClick }: {
  label: string; desc: string; active: boolean; color: string; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'block', textAlign: 'left', cursor: 'pointer',
        padding: '14px 16px',
        background: active ? `${color}18` : hov ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `2px solid ${active ? color : hov ? `${color}66` : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        transform: active ? 'scale(1.02)' : hov ? 'scale(1.01)' : 'scale(1)',
        boxShadow: active ? `0 0 20px ${color}44, 0 4px 16px rgba(0,0,0,0.3)` : 'none',
        transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div style={{
        fontFamily: '"Boogaloo", sans-serif', fontWeight: 400,
        fontSize: '1.05rem', color: active ? color : hov ? '#f0f0ff' : 'rgba(240,240,255,0.8)',
        marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: '"Boogaloo", sans-serif',
        fontSize: '0.8rem', color: 'rgba(200,190,255,0.45)', lineHeight: 1.3,
      }}>
        {desc}
      </div>
    </button>
  );
}

function ColorBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void; }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 4px',
        fontFamily: '"Boogaloo", sans-serif', fontSize: '0.95rem',
        borderRadius: 10,
        border: `2px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? color : 'rgba(200,190,255,0.5)',
        cursor: 'pointer',
        boxShadow: active ? `0 0 12px ${color}44` : 'none',
        transform: active ? 'scale(1.04)' : 'scale(1)',
        transition: 'all 0.15s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {label}
    </button>
  );
}
