import { useState, useCallback, useRef, useEffect } from 'react';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { useLocation } from 'wouter';
import { GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';
import { Switch } from '@/components/ui/switch';
import SnakeGame from '@/components/snake-game';
import OrbField from '@/components/orb-field';

const DEBUG_KEY = '2';
const DEBUG_PRESSES = 5;
const DEBUG_WINDOW_MS = 3000;

/* ── persistent settings store ─────────────────────────────────────────── */
let _settings: GameSettings = { ...DEFAULT_SETTINGS };
export function getGameSettings(): GameSettings { return _settings; }

/* ── constants ──────────────────────────────────────────────────────────── */
const PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];

const DVDS = [
  { color:'#ff2d78' }, { color:'#00f5ff' }, { color:'#39ff14' },
  { color:'#bf5fff' }, { color:'#ffee00' }, { color:'#ff6b00' },
];

const MODES = [
  { id: 'bot'           as const, label: 'vs Computer',  desc: 'AI opponent — set the strength', color: '#ff2d78' },
  { id: 'pass-and-play' as const, label: 'Same Screen',  desc: 'Two players, one device',        color: '#00f5ff' },
  { id: 'custom'        as const, label: 'Custom',        desc: 'Hand-pick the modifier pool',    color: '#39ff14' },
  { id: 'online'        as const, label: 'Online',        desc: 'Play someone over the internet', color: '#bf5fff' },
];

function eloLabel(elo: number): string {
  if (elo < 400)  return 'Baby';
  if (elo < 700)  return 'Casual';
  if (elo < 1000) return 'Club Player';
  if (elo < 1300) return 'Intermediate';
  if (elo < 1600) return 'Strong Amateur';
  if (elo < 1900) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2500) return 'FIDE Master';
  if (elo < 2700) return "Int'l Master";
  if (elo < 2850) return 'Grandmaster';
  return 'SUPER-GM';
}

interface Star { id: number; x: number; y: number; }

export default function Home() {
  const [, setLocation] = useLocation();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [settings, setSettings] = useState<GameSettings>({ ..._settings });
  const [showEffects, setShowEffects] = useState(false);
  const [flyingPieces, setFlyingPieces] = useState<{ id: number; piece: string; x: number }[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [playHovered, setPlayHovered] = useState(false);
  const [playWiggle, setPlayWiggle] = useState(false);
  const [glitching, setGlitching] = useState(false);
  const [snakeOpen, setSnakeOpen] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);
  const titleClickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const starId = useRef(0);
  const debugPressCount = useRef(0);
  const debugPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Secret debug mode: press "2" five times within DEBUG_WINDOW_MS → effect test page
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== DEBUG_KEY) return;
      debugPressCount.current += 1;
      if (debugPressTimer.current) clearTimeout(debugPressTimer.current);
      if (debugPressCount.current >= DEBUG_PRESSES) {
        debugPressCount.current = 0;
        setLocation('/effect-test');
        return;
      }
      debugPressTimer.current = setTimeout(() => {
        debugPressCount.current = 0;
      }, DEBUG_WINDOW_MS);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (debugPressTimer.current) clearTimeout(debugPressTimer.current);
    };
  }, [setLocation]);

  // Auto-wiggle play button
  useEffect(() => {
    const iv = setInterval(() => {
      setPlayWiggle(true);
      setTimeout(() => setPlayWiggle(false), 700);
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  // Random glitch on title
  useEffect(() => {
    const iv = setInterval(() => {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 300);
    }, 7000 + Math.random() * 4000);
    return () => clearInterval(iv);
  }, []);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    // Yeet a piece
    const id = nextId.current++;
    setFlyingPieces(p => [...p.slice(-14), {
      id, piece: PIECES[Math.floor(Math.random() * PIECES.length)], x: 5 + Math.random() * 88,
    }]);
    setTimeout(() => setFlyingPieces(p => p.filter(fp => fp.id !== id)), 1200);

    // Stars
    const cx = e.clientX, cy = e.clientY;
    for (let i = 0; i < 5; i++) {
      const sid = starId.current++;
      const angle = (i / 5) * Math.PI * 2;
      setStars(s => [...s, { id: sid, x: cx + Math.cos(angle) * 28, y: cy + Math.sin(angle) * 28 }]);
      setTimeout(() => setStars(s => s.filter(st => st.id !== sid)), 700);
    }

    // Triple-click → snake
    setTitleClicks(c => {
      const next = c + 1;
      if (titleClickTimeout.current) clearTimeout(titleClickTimeout.current);
      if (next >= 3) {
        setSnakeOpen(true);
        return 0;
      }
      titleClickTimeout.current = setTimeout(() => setTitleClicks(0), 1500);
      return next;
    });
  }, []);

  const startGame = () => {
    if (settings.mode === 'online' && !workerOnline) return;
    _settings = settings;
    setLocation('/game');
  };

  const [workerUrl, setWorkerUrl] = useState<string>('');
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);

  // Check if the worker is actually up, then route through the proxy
  useEffect(() => {
    fetch('/api/worker-status')
      .then(r => r.json())
      .then((data: { online: boolean }) => {
        setWorkerOnline(data.online);
        if (data.online) {
          const proxyUrl = `${window.location.origin}/api/worker-proxy`;
          localStorage.setItem('gambit_worker_url', proxyUrl);
          setWorkerUrl(proxyUrl);
        } else {
          localStorage.removeItem('gambit_worker_url');
        }
      })
      .catch(() => setWorkerOnline(false));
  }, []);

  return (
    <>
      {snakeOpen && <SnakeGame onClose={() => setSnakeOpen(false)} />}

      <div style={{ minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff', overflowX: 'hidden', fontFamily: '"Boogaloo", sans-serif' }} className="animate-flicker">

        {/* Scanline sweep */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: 'linear-gradient(transparent, rgba(180,130,255,0.06), transparent)',
            animation: 'scanline 8s linear infinite',
          }} />
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          style={{
            position: 'fixed', top: 14, right: 14, zIndex: 20,
            background: 'rgba(191,95,255,0.12)', border: '1px solid rgba(191,95,255,0.35)',
            borderRadius: 9, cursor: 'pointer', color: 'rgba(191,95,255,0.8)',
            width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.05rem', transition: 'all 0.15s',
          }}
        >
          {isFullscreen ? '⊠' : '⊡'}
        </button>

        {/* Physics orbs */}
        <OrbField />

        {/* Floating pieces + star bursts */}
        <div style={{ position:'fixed',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:60 }}>
          {flyingPieces.map(fp => (
            <span key={fp.id} className="animate-yeet" style={{
              position:'absolute', left:`${fp.x}%`, bottom:'30%',
              fontSize:'2rem', color: DVDS[fp.id % DVDS.length].color,
              filter:'drop-shadow(0 0 8px currentColor)',
            }}>{fp.piece}</span>
          ))}
          {stars.map(st => (
            <div key={st.id} className="animate-star-pop" style={{
              position:'fixed', left:st.x, top:st.y,
              width:10, height:10, color: DVDS[st.id % DVDS.length].color,
              fontSize:13, transform:'translate(-50%,-50%)',
            }}>★</div>
          ))}
        </div>

        {/* Content */}
        <div style={{ position:'relative', zIndex:10, maxWidth:570, margin:'0 auto', padding:'28px 24px 40px' }}>

          {/* Title */}
          <header style={{ marginBottom:20, position:'relative' }}>
            {/* Spinning conic ring */}
            <div style={{
              position:'absolute', top:-14, left:-20, width:72, height:72, borderRadius:'50%',
              background:'conic-gradient(#ff2d78,#ff9900,#ffee00,#39ff14,#00f5ff,#bf5fff,#ff2d78)',
              opacity:0.3, zIndex:-1,
            }} className="animate-spin-slow" />

            <button
              onClick={handleTitleClick}
              style={{ display:'block', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left', position:'relative' }}
              aria-label="Gamble Chess"
            >
              {/* Main title */}
              <h1 style={{
                fontFamily:'"Permanent Marker", cursive',
                fontSize:'clamp(3.2rem,13vw,5.8rem)',
                fontWeight:400, lineHeight:0.94, margin:0,
                background:'linear-gradient(135deg,#ff2d78 0%,#ff9900 25%,#ffee00 50%,#39ff14 75%,#00f5ff 100%)',
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
                filter:'drop-shadow(0 0 24px rgba(255,45,120,0.35))',
              }}>
                Gamble<br/>Chess
              </h1>

              {/* Glitch layers */}
              {glitching && (<>
                <h1 aria-hidden style={{
                  fontFamily:'"Permanent Marker", cursive',
                  fontSize:'clamp(3.2rem,13vw,5.8rem)', fontWeight:400, lineHeight:0.94,
                  margin:0, position:'absolute', inset:0,
                  color:'#00f5ff', opacity:0.7,
                  animation:'glitch-1 0.3s steps(1) both',
                }}>Gamble<br/>Chess</h1>
                <h1 aria-hidden style={{
                  fontFamily:'"Permanent Marker", cursive',
                  fontSize:'clamp(3.2rem,13vw,5.8rem)', fontWeight:400, lineHeight:0.94,
                  margin:0, position:'absolute', inset:0,
                  color:'#ff2d78', opacity:0.7,
                  animation:'glitch-2 0.3s steps(1) both',
                }}>Gamble<br/>Chess</h1>
              </>)}
            </button>

            {/* Triple-click hint */}
            {titleClicks > 0 && (
              <div style={{
                position:'absolute', top:4, right:0,
                fontFamily:'"Press Start 2P", monospace', fontSize:'0.5rem',
                color:'#bf5fff', letterSpacing:'0.08em',
              }}>
                {'▪'.repeat(titleClicks)}{'▫'.repeat(2 - titleClicks)}
              </div>
            )}

            <p style={{
              marginTop:16, fontFamily:'"Boogaloo", sans-serif', fontSize:'1.05rem',
              color:'rgba(200,190,255,0.65)', lineHeight:1.5,
            }}>
              Chess with a <span style={{ color:'#ff2d78' }}>chaotic</span> modifier wheel.
              Spin it. Get weird. Keep playing.
            </p>
          </header>

          {/* Mode */}
          <section style={{ marginBottom:20 }}>
            <p style={{ fontFamily:'"Press Start 2P", monospace', fontSize:'0.55rem', letterSpacing:'0.12em', color:'rgba(200,190,255,0.4)', marginBottom:10, textTransform:'uppercase' }}>
              // mode
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
              {MODES.map(mode => {
                const active = settings.mode === mode.id;
                const offline = mode.id === 'online' && workerOnline === false;
                const checking = mode.id === 'online' && workerOnline === null;
                const desc = offline
                  ? 'Server offline'
                  : checking
                  ? 'Checking server…'
                  : mode.desc;
                return (
                  <ModeCard
                    key={mode.id}
                    label={mode.label}
                    desc={desc}
                    active={active}
                    color={mode.color}
                    disabled={offline}
                    onClick={() => { if (!offline) setSettings(s => ({ ...s, mode: mode.id })); }}
                  />
                );
              })}
            </div>
          </section>

          {/* Settings */}
          <section style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:24 }}>

            {settings.mode === 'bot' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontFamily:'"Press Start 2P", monospace', fontSize:'0.52rem', color:'rgba(200,190,255,0.4)', letterSpacing:'0.1em' }}>
                    // strength
                  </span>
                  <span style={{ fontFamily:'"VT323", monospace', fontSize:'1.4rem', color:'#ff2d78' }}>
                    {settings.botElo}&nbsp;<span style={{ fontSize:'1rem', color:'rgba(200,190,255,0.4)' }}>{eloLabel(settings.botElo)}</span>
                  </span>
                </div>
                <input type="range" min={100} max={2850} step={25} value={settings.botElo}
                  onChange={e => setSettings(s => ({ ...s, botElo: Number(e.target.value) }))}
                  style={{ width:'100%', accentColor:'#ff2d78', display:'block' }} />
              </div>
            )}

            {settings.mode === 'bot' && (
              <div>
                <p style={{ fontFamily:'"Press Start 2P", monospace', fontSize:'0.52rem', color:'rgba(200,190,255,0.4)', letterSpacing:'0.1em', marginBottom:8 }}>
                  // play as
                </p>
                <div style={{ display:'flex', gap:6 }}>
                  {(['w','b','random'] as const).map((c,i) => (
                    <ColorBtn key={c}
                      label={c==='w' ? '♔  White' : c==='b' ? '♚  Black' : '?  Random'}
                      active={settings.playerColor === c}
                      color={['#ffee00','#00f5ff','#bf5fff'][i]}
                      onClick={() => setSettings(s => ({ ...s, playerColor: c }))}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontFamily:'"Press Start 2P", monospace', fontSize:'0.52rem', color:'rgba(200,190,255,0.4)', letterSpacing:'0.1em' }}>
                  // spin every
                </span>
                <span style={{ fontFamily:'"VT323", monospace', fontSize:'1.4rem', color:'#39ff14' }}>
                  {settings.spinInterval} moves
                </span>
              </div>
              <input type="range" min={3} max={10} step={1} value={settings.spinInterval}
                onChange={e => setSettings(s => ({ ...s, spinInterval: Number(e.target.value) }))}
                style={{ width:'100%', accentColor:'#39ff14', display:'block' }} />
            </div>

            {settings.mode === 'custom' && (
              <div>
                <button
                  onClick={() => setShowEffects(v => !v)}
                  style={{
                    background:'rgba(191,95,255,0.12)', border:'1.5px solid rgba(191,95,255,0.4)',
                    borderRadius:10, padding:'7px 16px',
                    fontFamily:'"Boogaloo", sans-serif', fontSize:'1rem',
                    color:'#bf5fff', letterSpacing:'0.02em', transition:'all 0.15s',
                  }}
                >
                  {showEffects ? 'Hide effects' : 'Edit effects'}&nbsp;
                  <span style={{ color:'rgba(200,190,255,0.4)' }}>({settings.enabledEffects.length} on)</span>
                </button>
                {showEffects && (
                  <div className="animate-slide-up" style={{
                    marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr',
                    gap:'10px 20px', maxHeight:200, overflowY:'auto',
                    background:'rgba(191,95,255,0.06)', border:'1px solid rgba(191,95,255,0.18)',
                    borderRadius:12, padding:14,
                  }}>
                    {(Object.entries(EFFECTS) as [EffectType, typeof EFFECTS[EffectType]][]).map(([id, def]) => (
                      <label key={id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <Switch
                          checked={settings.enabledEffects.includes(id)}
                          onCheckedChange={checked => setSettings(s => ({
                            ...s, enabledEffects: checked
                              ? [...s.enabledEffects, id]
                              : s.enabledEffects.filter(e => e !== id),
                          }))}
                        />
                        <span style={{
                          fontFamily:'"Boogaloo", sans-serif', fontSize:'0.9rem',
                          color: def.category === 'buff' ? '#39ff14' : '#ff2d78',
                        }}>{def.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Play */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button
              onClick={startGame}
              onMouseEnter={() => setPlayHovered(true)}
              onMouseLeave={() => setPlayHovered(false)}
              className={playWiggle ? 'animate-wiggle-btn' : ''}
              style={{
                width:'100%', padding:'19px 0',
                fontFamily:'"Permanent Marker", cursive', fontSize:'2.1rem',
                background: playHovered
                  ? 'linear-gradient(135deg,#ff9900,#ff2d78,#bf5fff)'
                  : 'linear-gradient(135deg,#ff2d78,#ff9900,#ffee00)',
                color:'#fff', border:'none', borderRadius:18,
                boxShadow: playHovered
                  ? '0 0 44px rgba(255,45,120,0.7), 0 8px 32px rgba(255,45,120,0.4)'
                  : '0 0 20px rgba(255,45,120,0.35), 0 4px 16px rgba(0,0,0,0.4)',
                transform: playHovered ? 'scale(1.03) translateY(-2px)' : 'scale(1)',
                transition:'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                letterSpacing:'0.05em',
              }}
            >
              PLAY
            </button>
            {settings.mode === 'online' && workerOnline === true && (
              <button
                onClick={() => { _settings = settings; setLocation('/lobby'); }}
                style={{
                  width:'100%', padding:'13px 0',
                  fontFamily:'"Boogaloo", sans-serif', fontSize:'1.15rem',
                  background:'rgba(191,95,255,0.12)',
                  color:'#bf5fff', border:'1.5px solid rgba(191,95,255,0.4)', borderRadius:14,
                  cursor:'pointer', letterSpacing:'0.04em',
                  transition:'all 0.15s',
                }}
              >
                🎲 Custom Rooms — create or browse
              </button>
            )}
          </div>

          {/* Online status indicator — no URL exposed to players */}
          <div style={{ marginTop:36 }}>
            <div style={{ height:1, background:'rgba(191,95,255,0.15)', marginBottom:14 }} />
            <p style={{
              fontFamily:'"Press Start 2P", monospace', fontSize:'0.45rem',
              color: workerUrl ? 'rgba(57,255,20,0.45)' : 'rgba(200,190,255,0.2)',
              letterSpacing:'0.08em',
            }}>
              {workerUrl ? '// online play: ready' : '// online play: offline'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ModeCard({ label, desc, active, color, disabled, onClick }: {
  label: string; desc: string; active: boolean; color: string; disabled?: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:'block', textAlign:'left', padding:'13px 15px',
        background: disabled ? 'rgba(255,255,255,0.01)' : active ? `${color}16` : hov ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
        border:`2px solid ${disabled ? 'rgba(255,255,255,0.04)' : active ? color : hov ? `${color}55` : 'rgba(255,255,255,0.07)'}`,
        borderRadius:14,
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: !disabled && active ? 'scale(1.02)' : !disabled && hov ? 'scale(1.01)' : 'scale(1)',
        boxShadow: !disabled && active ? `0 0 22px ${color}44, 0 4px 18px rgba(0,0,0,0.3)` : 'none',
        transition:'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div style={{
        fontFamily:'"Boogaloo", sans-serif', fontSize:'1.05rem',
        color: disabled ? 'rgba(240,240,255,0.35)' : active ? color : hov ? '#f0f0ff' : 'rgba(240,240,255,0.75)',
        marginBottom:2,
      }}>{label}</div>
      <div style={{
        fontFamily:'"Boogaloo", sans-serif', fontSize:'0.78rem',
        color: disabled ? 'rgba(255,80,80,0.5)' : 'rgba(200,190,255,0.38)', lineHeight:1.3,
      }}>{desc}</div>
    </button>
  );
}

function ColorBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex:1, padding:'9px 4px',
      fontFamily:'"Boogaloo", sans-serif', fontSize:'0.92rem',
      borderRadius:10,
      border:`2px solid ${active ? color : 'rgba(255,255,255,0.09)'}`,
      background: active ? `${color}20` : 'transparent',
      color: active ? color : 'rgba(200,190,255,0.45)',
      boxShadow: active ? `0 0 14px ${color}44` : 'none',
      transform: active ? 'scale(1.03)' : 'scale(1)',
      transition:'all 0.15s cubic-bezier(0.34,1.56,0.64,1)',
    }}>{label}</button>
  );
}
