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
  { id: 'bot'           as const, label: 'vs Computer',  desc: 'AI opponent — set the ELO' },
  { id: 'pass-and-play' as const, label: 'Same Screen',  desc: 'Two players, one device' },
  { id: 'custom'        as const, label: 'Custom',       desc: 'Hand-pick the modifier pool' },
  { id: 'online'        as const, label: 'Online',       desc: 'Play someone over the internet' },
];

function eloLabel(elo: number): string {
  if (elo < 400)  return 'Beginner';
  if (elo < 700)  return 'Casual';
  if (elo < 1000) return 'Club';
  if (elo < 1300) return 'Intermediate';
  if (elo < 1600) return 'Strong Amateur';
  if (elo < 1900) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2500) return 'FIDE Master';
  if (elo < 2700) return 'IM';
  if (elo < 2850) return 'Grandmaster';
  return 'Super-GM';
}

/* ── raw palette ────────────────────────────────────────────────────────── */
const C = {
  bg:          '#0d0d0d',
  surface:     '#131313',
  surfaceHov:  '#181818',
  surfaceAct:  '#1c1c1c',
  border:      '#272727',
  borderBright:'#3a3a3a',
  red:         '#f72f22',
  redDim:      '#c92218',
  yellow:      '#ffd600',
  text:        '#ede9e2',
  sub:         '#999',
  dim:         '#444',
  green:       '#21d47e',
  nerf:        '#f72f22',
} as const;

const LABEL: React.CSSProperties = {
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.sub,
};

/* ── component ──────────────────────────────────────────────────────────── */
export default function Home() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<GameSettings>({ ..._settings });
  const [showEffects, setShowEffects] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [flyingPieces, setFlyingPieces] = useState<FlyingPiece[]>([]);
  const nextId = useRef(0);

  const spewPiece = useCallback(() => {
    const id = nextId.current++;
    setFlyingPieces(p => [...p.slice(-12), {
      id,
      piece: PIECES[Math.floor(Math.random() * PIECES.length)],
      x: 5 + Math.random() * 90,
    }]);
    setTimeout(() => setFlyingPieces(p => p.filter(fp => fp.id !== id)), 1400);
  }, []);

  const startGame = () => {
    _settings = settings;
    setLocation('/game');
  };

  const workerUrl = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('gambit_worker_url') ?? '')
    : '';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '"DM Sans", sans-serif' }}>

      {/* Flying pieces */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }}>
        {flyingPieces.map(fp => (
          <span
            key={fp.id}
            className="animate-yeet"
            style={{
              position: 'absolute',
              left: `${fp.x}%`,
              bottom: '40%',
              fontSize: '1.5rem',
              color: C.red,
              userSelect: 'none',
            }}
          >
            {fp.piece}
          </span>
        ))}
      </div>

      {/* Top rule */}
      <div style={{ height: 3, background: C.red }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '52px 28px 80px' }}>

        {/* ── Title ── */}
        <header style={{ marginBottom: 52 }}>
          <button
            onClick={spewPiece}
            style={{ display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            aria-label="Gamble Chess"
          >
            <h1 style={{
              fontFamily: '"Anton", impact, sans-serif',
              fontSize: 'clamp(3.8rem, 14vw, 6.5rem)',
              fontWeight: 400,
              letterSpacing: '0.03em',
              lineHeight: 0.88,
              color: C.text,
              margin: 0,
              textTransform: 'uppercase',
            }}>
              GAMBLE<br />CHESS
            </h1>
          </button>
          <p style={{
            marginTop: 16,
            fontSize: '0.88rem',
            fontWeight: 400,
            color: C.sub,
            lineHeight: 1.65,
            maxWidth: 340,
          }}>
            Chess, plus a modifier wheel every few moves.
            Random buff or nerf. Keep playing.
          </p>
        </header>

        {/* ── Mode ── */}
        <section style={{ marginBottom: 36 }}>
          <p style={{ ...LABEL, marginBottom: 10 }}>Mode</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
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

        {/* ── Settings ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 40 }}>

          {settings.mode === 'bot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={LABEL}>Opponent strength</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.85rem', color: C.red }}>
                  {settings.botElo}
                  <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '0.7rem', color: C.sub, marginLeft: 6, fontWeight: 400 }}>
                    {eloLabel(settings.botElo)}
                  </span>
                </span>
              </div>
              <input
                type="range" min={100} max={2850} step={25}
                value={settings.botElo}
                onChange={e => setSettings(s => ({ ...s, botElo: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: C.red, cursor: 'pointer', display: 'block' }}
              />
            </div>
          )}

          {settings.mode === 'bot' && (
            <div>
              <p style={{ ...LABEL, marginBottom: 10 }}>Play as</p>
              <div style={{ display: 'flex', gap: 4 }}>
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

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={LABEL}>Modifier every</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.85rem', color: C.text }}>
                {settings.spinInterval} moves
              </span>
            </div>
            <input
              type="range" min={3} max={10} step={1}
              value={settings.spinInterval}
              onChange={e => setSettings(s => ({ ...s, spinInterval: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: C.red, cursor: 'pointer', display: 'block' }}
            />
          </div>

          {settings.mode === 'custom' && (
            <div>
              <button
                onClick={() => setShowEffects(v => !v)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: '"DM Sans", sans-serif', fontSize: '0.78rem',
                  fontWeight: 600, color: C.red, letterSpacing: '0.01em',
                  textTransform: 'uppercase',
                }}
              >
                {showEffects ? '− Hide' : '+ Edit'} effects
                <span style={{ color: C.sub, fontWeight: 400, textTransform: 'none' }}>
                  &ensp;{settings.enabledEffects.length} active
                </span>
              </button>
              {showEffects && (
                <div style={{
                  marginTop: 12,
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px 24px', maxHeight: 200, overflowY: 'auto',
                  borderLeft: `2px solid ${C.border}`, paddingLeft: 12,
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
                        fontFamily: '"DM Sans", sans-serif', fontSize: '0.74rem',
                        color: def.category === 'buff' ? C.green : C.nerf,
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

          {settings.mode === 'online' && (
            <p style={{ fontSize: '0.8rem', color: workerUrl ? C.green : C.nerf, fontFamily: '"JetBrains Mono", monospace' }}>
              {workerUrl
                ? `✓ ${workerUrl.replace(/https?:\/\//, '').slice(0, 48)}`
                : '✗ no worker url — set one below'}
            </p>
          )}
        </section>

        {/* ── Play ── */}
        <PlayButton onClick={startGame} />

        {/* ── Worker URL ── */}
        <div style={{ marginTop: 48 }}>
          <div style={{ height: 1, background: C.border, marginBottom: 20 }} />
          <button
            onClick={() => setShowWorker(v => !v)}
            style={{
              display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: '"DM Sans", sans-serif', fontSize: '0.7rem',
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: C.dim,
            }}
          >
            <span>Multiplayer Worker URL</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem' }}>
              {showWorker ? '▲' : '▼'}
            </span>
          </button>

          {showWorker && (
            <div style={{ marginTop: 10 }} className="animate-slide-up">
              <input
                type="url"
                placeholder="https://your-worker.workers.dev"
                defaultValue={workerUrl}
                onChange={e => localStorage.setItem('gambit_worker_url', e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem',
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 0, color: C.text, outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = C.red)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
              <p style={{
                marginTop: 8,
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.7rem',
                color: C.dim, lineHeight: 1.6,
              }}>
                Free Cloudflare plan: 100k requests/day. Game polls every 8s.
                See <code style={{ color: C.sub }}>worker/README.md</code>.
              </p>
            </div>
          )}
        </div>
      </div>
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
        padding: '13px 14px',
        background: active ? 'rgba(247,47,34,0.07)' : hovered ? C.surfaceHov : C.surface,
        border: `1px solid ${active ? C.red : hovered ? C.borderBright : C.border}`,
        borderLeft: `3px solid ${active ? C.red : 'transparent'}`,
        borderRadius: 0,
        transition: 'all 0.1s',
      }}
    >
      <div style={{
        fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
        fontSize: '0.85rem', color: active ? C.red : C.text,
        marginBottom: 3, letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: '"DM Sans", sans-serif', fontWeight: 400,
        fontSize: '0.7rem', color: C.sub, lineHeight: 1.4,
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
        fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
        fontSize: '0.78rem', letterSpacing: '0.02em',
        borderRadius: 0,
        border: `1px solid ${active ? C.red : C.border}`,
        background: active ? C.red : hovered ? C.surfaceHov : 'transparent',
        color: active ? '#fff' : C.sub,
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
        width: '100%', padding: '17px 0',
        fontFamily: '"Anton", impact, sans-serif',
        fontWeight: 400, fontSize: '1.5rem',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        background: hovered ? '#c92218' : '#f72f22',
        color: '#fff',
        border: 'none', borderRadius: 0,
        cursor: 'pointer',
        transform: pressed ? 'scale(0.985)' : 'scale(1)',
        transition: 'background 0.08s, transform 0.06s',
      }}
    >
      PLAY
    </button>
  );
}
