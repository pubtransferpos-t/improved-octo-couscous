import { useEffect, useRef } from 'react';

const ORB_DEFS = [
  { piece: '♕', color: '#ff2d78', r: 32 },
  { piece: '♞', color: '#00f5ff', r: 29 },
  { piece: '♜', color: '#39ff14', r: 30 },
  { piece: '♝', color: '#bf5fff', r: 28 },
  { piece: '♛', color: '#ffee00', r: 31 },
  { piece: '♟', color: '#ff6b00', r: 26 },
];

const RAINBOW = ['#ff2d78', '#ff6b00', '#ffee00', '#39ff14', '#00f5ff', '#bf5fff'];
const BASE_SPEED = 2.4;
const MIN_SPEED = BASE_SPEED * 0.75;
const FRICTION = 0.986;          // applied only above MIN_SPEED
const EXPLODE_THRESHOLD = 6.0;   // relative speed (px/frame) needed for explosion chance
const EXPLODE_CHANCE = 0.5;

interface Orb {
  x: number; y: number;
  vx: number; vy: number;
  r: number; piece: string; color: string;
  flash: number;
  dead: boolean;
  respawnAt: number;
}

interface Beam {
  ox: number; oy: number;
  angle: number; len: number; maxLen: number;
  color: string; alpha: number;
}

interface Wave {
  x: number; y: number; r: number; alpha: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

function playJazz(actx: AudioContext) {
  const notes = [261.63, 329.63, 392.0, 493.88, 587.33, 659.25];
  notes.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.006);
    osc.connect(gain);
    gain.connect(actx.destination);
    const t = actx.currentTime + i * 0.038;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.17, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.start(t); osc.stop(t + 0.6);
  });
  try {
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.09), actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
    const src = actx.createBufferSource();
    src.buffer = buf;
    const ng = actx.createGain();
    ng.gain.setValueAtTime(1, actx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.09);
    src.connect(ng); ng.connect(actx.destination); src.start(actx.currentTime);
  } catch { /* ignore */ }
}

function playBoom(actx: AudioContext) {
  // Low thud + noise burst for explosion
  try {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, actx.currentTime + 0.4);
    osc.connect(gain); gain.connect(actx.destination);
    gain.gain.setValueAtTime(0.5, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
    osc.start(actx.currentTime); osc.stop(actx.currentTime + 0.5);

    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.3), actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const ng = actx.createGain();
    ng.gain.setValueAtTime(0.4, actx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.3);
    src.connect(ng); ng.connect(actx.destination); src.start(actx.currentTime);
  } catch { /* ignore */ }
}

export default function OrbField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    const ctx = canvas.getContext('2d')!;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    let actx: AudioContext | null = null;
    function audio() {
      if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }

    const orbs: Orb[] = ORB_DEFS.map(def => ({
      ...def,
      x: def.r * 3 + Math.random() * (W - def.r * 6),
      y: def.r * 3 + Math.random() * (H - def.r * 6),
      vx: (Math.random() < 0.5 ? -1 : 1) * (BASE_SPEED * 0.7 + Math.random() * BASE_SPEED),
      vy: (Math.random() < 0.5 ? -1 : 1) * (BASE_SPEED * 0.7 + Math.random() * BASE_SPEED),
      flash: 0, dead: false, respawnAt: 0,
    }));

    const beams: Beam[] = [];
    const waves: Wave[] = [];
    const particles: Particle[] = [];

    let frameCount = 0;
    let lastJazz = 0;
    let frozen = false;
    // Cooldown so one collision can't trigger multiple explosions in the same frame
    let explodeCooldown = 0;

    // ── helpers ───────────────────────────────────────────────────────────────

    function cornerEffect(orb: Orb) {
      orb.flash = 45;
      const now = performance.now();
      if (now - lastJazz > 300) {
        lastJazz = now;
        try { playJazz(audio()); } catch { /* blocked */ }
      }
      for (let i = 0; i < 8; i++) {
        beams.push({
          ox: orb.x, oy: orb.y,
          angle: (i / 8) * Math.PI * 2,
          len: 0, maxLen: 200 + Math.random() * 250,
          color: RAINBOW[i % RAINBOW.length], alpha: 1,
        });
      }
    }

    function spawnParticles(x: number, y: number, colors: string[]) {
      const count = 28 + Math.floor(Math.random() * 12);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 9;
        const life = 45 + Math.floor(Math.random() * 35);
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life, maxLife: life,
          color: Math.random() < 0.5
            ? colors[Math.floor(Math.random() * colors.length)]
            : RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
          size: 2 + Math.random() * 5,
        });
      }
    }

    function flashAndExplode(orb: Orb, x: number, y: number, colors: string[]) {
      frozen = true;
      // Phase 1: white flash
      overlay.style.backgroundColor = '#fff';
      overlay.style.opacity = '0.92';
      try { playBoom(audio()); } catch { /* blocked */ }

      setTimeout(() => {
        // Phase 2: black flash
        overlay.style.backgroundColor = '#111';
        overlay.style.opacity = '0.95';
      }, 280);

      setTimeout(() => {
        // Reveal: fade out overlay, unfreeze, spawn particles, kill orb
        overlay.style.opacity = '0';
        frozen = false;
        spawnParticles(x, y, colors);
        orb.dead = true;
        orb.respawnAt = performance.now() + 7000 + Math.random() * 5000;
      }, 580);
    }

    function addShockwave(x: number, y: number) {
      waves.push({ x, y, r: 0, alpha: 0.9 });
      const strength = 45 + Math.random() * 85;
      orbs.forEach(o => {
        if (o.dead) return;
        const dx = o.x - x, dy = o.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 520 && d > 1) {
          const s = strength * (1 - d / 520);
          o.vx += (dx / d) * s;
          o.vy += (dy / d) * s;
        }
      });
    }

    // ── update ────────────────────────────────────────────────────────────────

    function update() {
      frameCount++;
      if (frozen) return;
      if (explodeCooldown > 0) explodeCooldown--;

      // Respawn dead orbs
      const now = performance.now();
      orbs.forEach(o => {
        if (o.dead && now >= o.respawnAt) {
          o.dead = false;
          o.x = o.r * 2 + Math.random() * (W - o.r * 4);
          o.y = H + o.r; // start just below screen
          const spawnSpeed = BASE_SPEED * (0.35 + Math.random() * 0.45);
          const angle = -(0.3 + Math.random() * 0.7) * Math.PI; // upward arc
          o.vx = Math.cos(angle) * spawnSpeed * (Math.random() < 0.5 ? 1 : -1) * 0.4;
          o.vy = -spawnSpeed; // going up
          o.flash = 30;
        }
      });

      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        if (o.dead) continue;

        o.x += o.vx;
        o.y += o.vy;
        if (o.flash > 0) o.flash--;

        // Friction — only bleed off excess above MIN_SPEED
        const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
        if (speed > MIN_SPEED) {
          const newSpeed = Math.max(MIN_SPEED, speed * FRICTION);
          o.vx = (o.vx / speed) * newSpeed;
          o.vy = (o.vy / speed) * newSpeed;
        }

        // Wall bounce + corner detection
        let hx = false, hy = false;
        if (o.x - o.r < 0)  { o.x = o.r;     o.vx =  Math.abs(o.vx); hx = true; }
        if (o.x + o.r > W)  { o.x = W - o.r;  o.vx = -Math.abs(o.vx); hx = true; }
        if (o.y - o.r < 0)  { o.y = o.r;      o.vy =  Math.abs(o.vy); hy = true; }
        if (o.y + o.r > H)  { o.y = H - o.r;  o.vy = -Math.abs(o.vy); hy = true; }
        if (hx && hy) cornerEffect(o);

        // Orb-orb collisions
        for (let j = i + 1; j < orbs.length; j++) {
          const b = orbs[j];
          if (b.dead) continue;
          const dx = b.x - o.x, dy = b.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minD = o.r + b.r;
          if (dist < minD && dist > 0.01) {
            const nx = dx / dist, ny = dy / dist;
            const overlap = (minD - dist) * 0.5;
            o.x -= nx * overlap; o.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;

            // Relative velocity along normal
            const relVn = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
            if (relVn > 0) {
              // Check for explosion
              if (
                explodeCooldown === 0 &&
                relVn > EXPLODE_THRESHOLD &&
                Math.random() < EXPLODE_CHANCE
              ) {
                explodeCooldown = 90; // ~1.5s cooldown
                const cx = (o.x + b.x) / 2, cy = (o.y + b.y) / 2;
                // Randomly pick one orb to explode
                const victim = Math.random() < 0.5 ? o : b;
                flashAndExplode(victim, cx, cy, [o.color, b.color]);
              } else {
                // Normal elastic collision
                o.vx -= relVn * nx; o.vy -= relVn * ny;
                b.vx += relVn * nx; b.vy += relVn * ny;
              }
            }
          }
        }
      }

      // Beams
      for (let i = beams.length - 1; i >= 0; i--) {
        const beam = beams[i];
        if (beam.len < beam.maxLen) {
          beam.len += 11;
        } else {
          beam.alpha -= 0.032;
          if (beam.alpha <= 0) { beams.splice(i, 1); continue; }
        }
        const ex = beam.ox + Math.cos(beam.angle) * beam.len;
        const ey = beam.oy + Math.sin(beam.angle) * beam.len;
        const sdx = ex - beam.ox, sdy = ey - beam.oy;
        const sl2 = sdx * sdx + sdy * sdy;
        orbs.forEach(o => {
          if (o.dead || sl2 < 0.01) return;
          const t = Math.max(0, Math.min(1, ((o.x - beam.ox) * sdx + (o.y - beam.oy) * sdy) / sl2));
          const cx = beam.ox + t * sdx - o.x, cy = beam.oy + t * sdy - o.y;
          if (Math.sqrt(cx * cx + cy * cy) < o.r + 6) {
            o.vx += Math.cos(beam.angle) * 2.2;
            o.vy += Math.sin(beam.angle) * 2.2;
          }
        });
      }

      // Waves
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].r += 15; waves[i].alpha -= 0.033;
        if (waves[i].alpha <= 0) waves.splice(i, 1);
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.18; // gravity
        p.vx *= 0.97;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    // ── draw ──────────────────────────────────────────────────────────────────

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Beams
      beams.forEach(b => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.alpha);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = b.color; ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(b.ox, b.oy);
        ctx.lineTo(b.ox + Math.cos(b.angle) * b.len, b.oy + Math.sin(b.angle) * b.len);
        ctx.stroke();
        ctx.restore();
      });

      // Shockwave rings
      waves.forEach(w => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, w.alpha);
        ctx.strokeStyle = '#bf5fff'; ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = Math.max(0, w.alpha * 0.4);
        ctx.beginPath(); ctx.arc(w.x, w.y, Math.max(0, w.r - 18), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      });

      // Explosion particles
      particles.forEach(p => {
        const t = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Orbs
      orbs.forEach(o => {
        if (o.dead) return;
        const fc = o.flash > 0 ? RAINBOW[Math.floor(frameCount / 4) % RAINBOW.length] : o.color;
        ctx.save();
        ctx.shadowColor = fc;
        ctx.shadowBlur = o.flash > 0 ? 50 : 24;

        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fillStyle = fc + '20'; ctx.fill();
        ctx.strokeStyle = fc; ctx.lineWidth = 2.5; ctx.stroke();

        if (o.flash > 0) {
          ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = RAINBOW[(Math.floor(frameCount / 4) + 3) % RAINBOW.length];
          ctx.lineWidth = 2; ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = fc;
        ctx.font = `${Math.round(o.r * 0.88)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(o.piece, o.x, o.y);
        ctx.restore();
      });
    }

    let raf: number;
    function loop() { update(); draw(); raf = requestAnimationFrame(loop); }
    raf = requestAnimationFrame(loop);

    function onClick(e: MouseEvent) { addShockwave(e.clientX, e.clientY); }
    function onResize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    }

    window.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      actx?.close();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, display: 'block',
      }} />
      <div ref={overlayRef} style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200,
        backgroundColor: '#fff', opacity: 0,
        transition: 'opacity 0.06s ease',
      }} />
    </>
  );
}
