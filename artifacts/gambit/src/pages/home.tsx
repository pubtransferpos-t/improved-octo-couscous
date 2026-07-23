import { useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';
import { Switch } from '@/components/ui/switch';

/* ── persistent settings store ─────────────────────────────────────────── */
let _settings: GameSettings = { ...DEFAULT_SETTINGS };
export function getGameSettings(): GameSettings { return _settings; }

/* ── constants ──────────────────────────────────────────────────────────── */
const PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];

interface FlyingPiece { id: number; piece: string; x: number; }

const MODES = [
  { id: 'bot'           as const, label: 'vs Computer',  desc: 'AI opponent, adjustable strength' },
  { id: 'pass-and-play' as const, label: 'Same Screen',  desc: 'Two players, one device, take turns' },
  { id: 'custom'        as const, label: 'Custom Rules', desc: 'Choose which modifiers are in the pool' },
  { id: 'online'        as const, label: 'Online',       desc: 'Play against someone over the internet' },
];

function eloLabel(elo: number): string {
  if (elo < 400)  return 'Beginner';
  if (elo < 700)  return 'Casual';
  if (elo < 1000) return 'Club player';
  if (elo < 1300) return 'Intermediate';
  if (elo < 1600) return 'Strong amateur';
  if (elo < 1900) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2500) return 'FIDE Master';
  if (elo < 2700) return 'International Master';
  if (elo < 2850) return 'Grandmaster';
  return 'Super-GM';
}

/* ── palette (used inline so the dark bg doesn't need Tailwind dark-mode) ── */
const C = {
  bg:      '#0f0e0d',
  surface: '#161513',
  surfaceHover: '#1a1917',
  surfaceActive: '#1f1e1b',
  border:  '#272522',
  accent:  '#d4a843',
  accentDim: '#c49a35',
  text:    '#e8e2d8',
  muted:   '#5e5a54',
  mutedLo: '#302e2b',
  green:   '#6ea86e',
  red:     '#b86e6e',
} as const;

/* ── label style (reused) ───────────────────────────────────────────────── */
const fieldLabel: React.CSSProperties = {
  fontFamily: '"Outfit", sans-serif',
  fontSize: '0.72rem',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.muted,
};

/* ── main component ─────────────────────────────────────────────────────── */
export default function Home() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<GameSettings>({ ..._settings });
  const [showEffects, setShowEffects] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [flyingPieces, setFlyingPieces] = useState<FlyingPiece[]>([]);
  const nextId = useRef(0);

  const spewPiece = useCallback(() => {
    const id = nextId.current++;
    setFlyingPieces(p => [...p.slice(-14), {
      id,
      piece: PIECES[Math.floor(Math.random() * PIECES.length)],
      x: 8 + Math.random() * 84,
    }]);
    setTimeout(() => setFlyingPieces(p => p.filter(fp => fp.id !== id)), 1500);
  }, []);

  const startGame = () => {
    _settings = settings;
    setLocation('/game');
  };

  const workerUrl = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('gambit_worker_url') ?? '')
    : '';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>

      {/* flying pieces */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }}>
        {flyingPieces.map(fp => (
          <span
            key={fp.id}
            style={{
              position: 'absolute',
              left: `${fp.x}%`,
              bottom: '35%',
              fontSize: '1.6rem',
              color: C.accent,
              opacity: 0.85,
              animation: 'gc-yeet 1.5s cubic-bezier(0.2,0.9,0.3,1) forwards',
              userSelect: 'none',
            }}
          >
            {fp.piece}
          </span>
        ))}
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 36px 96px' }}>

        {/* ── title ── */}
        <header style={{ marginBottom: 56 }}>
          <button
            onClick={spewPiece}
            style={{ display: 'block', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Gamble Chess"
          >
            <h1 style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(2.8rem, 8vw, 5rem)',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              color: C.text,
              transform: 'rotate(-1.1deg)',
              display: 'inline-block',
              margin: 0,
            }}>
              Gamble Chess
            </h1>
          </button>

          <p style={{
            marginTop: 18,
            fontFamily: '"Outfit", sans-serif',
            fontSize: '0.95rem',
            fontWeight: 400,
            color: C.muted,
            lineHeight: 1.6,
            maxWidth: 380,
          }}>
            Standard chess, plus a modifier wheel that spins every few moves.
            You get a random buff or nerf and keep playing.
          </p>
        </header>

        {/* ── mode selection ── */}
        <section style={{ marginBottom: 40 }}>
          <p style={{ ...fieldLabel, marginBottom: 10 }}>Mode</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {MODES.map(mode => {
              const active = settings.mode === mode.id;
              return (
                <ModeCard
                  key={mode.id}
                  label={mode.label}
                  desc={mode.desc}
                  active={active}
                  onClick={() => setSettings(s => ({ ...s, mode: mode.id }))}
                />
              );
            })}
          </div>
        </section>

        {/* ── settings ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 44 }}>

          {/* ELO */}
          {settings.mode === 'bot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={fieldLabel}>Opponent strength</span>
                <span style={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem', color: C.accent }}>
                  {settings.botElo}&thinsp;
                  <span style={{ fontFamily: '"Outfit", sans-serif', fontSize: '0.72rem', color: C.muted, fontWeight: 400 }}>
                    {eloLabel(settings.botElo)}
                  </span>
                </span>
              </div>
              <input
                type="range" min={100} max={2850} step={25}
                value={settings.botElo}
                onChange={e => setSettings(s => ({ ...s, botElo: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: C.accent, cursor: 'pointer', display: 'block' }}
              />
            </div>
          )}

          {/* Color */}
          {settings.mode === 'bot' && (
            <div>
              <p style={{ ...fieldLabel, marginBottom: 10 }}>Play as</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['w', 'b', 'random'] as const).map(c => (
                  <ColorBtn
                    key={c}
                    label={c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                    active={settings.playerColor === c}
                    onClick={() => setSettings(s => ({ ...s, playerColor: c }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Spin interval */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={fieldLabel}>Modifier interval</span>
              <span style={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem', color: C.text }}>
                {settings.spinInterval} moves
              </span>
            </div>
            <input
              type="range" min={3} max={10} step={1}
              value={settings.spinInterval}
              onChange={e => setSettings(s => ({ ...s, spinInterval: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: C.accent, cursor: 'pointer', display: 'block' }}
            />
          </div>

          {/* Effects list — custom mode only */}
          {settings.mode === 'custom' && (
            <div>
              <button
                onClick={() => setShowEffects(v => !v)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: '"Outfit", sans-serif', fontSize: '0.8rem',
                  fontWeight: 500, color: C.accent, letterSpacing: '0.02em',
                }}
              >
                {showEffects ? 'Hide' : 'Edit'} effects
                <span style={{ color: C.muted, fontWeight: 400 }}>
                  &ensp;{settings.enabledEffects.length} active
                </span>
              </button>
              {showEffects && (
                <div style={{
                  marginTop: 14,
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px 20px', maxHeight: 200, overflowY: 'auto',
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
                        fontFamily: '"Outfit", sans-serif', fontSize: '0.75rem',
                        color: def.category === 'buff' ? C.green : C.red,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {def.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Online status */}
          {settings.mode === 'online' && (
            <p style={{ fontFamily: '"Outfit", sans-serif', fontSize: '0.82rem', color: workerUrl ? C.green : C.red }}>
              {workerUrl
                ? `Worker: ${workerUrl.replace(/https?:\/\//, '').slice(0, 52)}`
                : 'No worker URL configured — set one below'}
            </p>
          )}
        </section>

        {/* ── play button ── */}
        <PlayButton onClick={startGame} />

        {/* ── worker URL ── */}
        <div style={{ marginTop: 52, paddingTop: 20, borderTop: `1px solid ${C.mutedLo}` }}>
          <button
            onClick={() => setShowWorker(v => !v)}
            style={{
              display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: '"Outfit", sans-serif', fontSize: '0.72rem',
              color: C.mutedLo, letterSpacing: '0.04em',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.muted)}
            onMouseLeave={e => (e.currentTarget.style.color = C.mutedLo)}
          >
            <span>Multiplayer worker URL</span>
            <span style={{ fontFamily: '"Space Mono", monospace', fontSize: '0.65rem' }}>
              {showWorker ? '↑' : '↓'}
            </span>
          </button>

          {showWorker && (
            <div style={{ marginTop: 10 }}>
              <input
                type="url"
                placeholder="https://your-worker.workers.dev"
                defaultValue={workerUrl}
                onChange={e => localStorage.setItem('gambit_worker_url', e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 12px',
                  fontFamily: '"Space Mono", monospace', fontSize: '0.72rem',
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 3, color: C.text, outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
              <p style={{
                marginTop: 7,
                fontFamily: '"Outfit", sans-serif', fontSize: '0.7rem',
                color: C.mutedLo, lineHeight: 1.6,
              }}>
                Free plan is 100k requests/day. Game polls every 8 seconds.
                See <code style={{ color: C.muted }}>worker/README.md</code> for setup.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes gc-yeet {
          0%   { opacity: 0.85; transform: translateY(0) scale(1) rotate(0deg); }
          25%  { opacity: 0.85; }
          100% { opacity: 0; transform: translateY(-160px) scale(0.25) rotate(220deg); }
        }
      `}</style>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────── */

function ModeCard({ label, desc, active, onClick }: {
  label: string; desc: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', textAlign: 'left', cursor: 'pointer',
        padding: '14px 16px',
        background: active ? C.surfaceActive : hovered ? C.surfaceHover : C.surface,
        border: `1px solid ${active ? C.accent : C.border}`,
        borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
        borderRadius: 4,
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <div style={{
        fontFamily: '"Outfit", sans-serif', fontWeight: 600,
        fontSize: '0.88rem', color: active ? C.accent : C.text,
        marginBottom: 4, letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: '"Outfit", sans-serif', fontWeight: 400,
        fontSize: '0.72rem', color: C.muted, lineHeight: 1.45,
      }}>
        {desc}
      </div>
    </button>
  );
}

function ColorBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void; }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, padding: '9px 0',
        fontFamily: '"Outfit", sans-serif', fontWeight: 500, fontSize: '0.82rem',
        borderRadius: 3,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : hovered ? C.surfaceHover : 'transparent',
        color: active ? C.bg : C.muted,
        cursor: 'pointer', transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}

function PlayButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: '100%', padding: '15px 0',
        fontFamily: '"Outfit", sans-serif', fontWeight: 700,
        fontSize: '1rem', letterSpacing: '0.05em',
        background: hovered ? C.accentDim : C.accent,
        color: C.bg, border: 'none', borderRadius: 3,
        cursor: 'pointer',
        transform: pressed ? 'scale(0.988)' : 'none',
        transition: 'background 0.1s, transform 0.08s',
      }}
    >
      Play
    </button>
  );
}
