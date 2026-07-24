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

interface Orb {
  x: number; y: number;
  vx: number; vy: number;
  r: number; piece: string; color: string;
  flash: number; // frames left of rainbow flash
}

interface Beam {
  ox: number; oy: number;
  angle: number;
  len: number;
  maxLen: number;
  color: string;
  alpha: number;
}

interface Wave {
  x: number; y: number;
  r: number; alpha: number;
}

function playJazz(actx: AudioContext) {
  // Ascending maj9 strum — Deltarune-style jazz hit
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
    osc.start(t);
    osc.stop(t + 0.6);
  });
  // Snare burst
  try {
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.09), actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
    const src = actx.createBufferSource();
    src.buffer = buf;
    const ng = actx.createGain();
    ng.gain.setValueAtTime(1, actx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.09);
    src.connect(ng);
    ng.connect(actx.destination);
    src.start(actx.currentTime);
  } catch { /* ignore */ }
}

export default function OrbField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    // AudioContext created lazily on first interaction to satisfy browser policy
    let actx: AudioContext | null = null;
    function audio() {
      if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }

    // Init orbs with random positions + velocities
    const orbs: Orb[] = ORB_DEFS.map(def => ({
      ...def,
      x: def.r * 3 + Math.random() * (W - def.r * 6),
      y: def.r * 3 + Math.random() * (H - def.r * 6),
      vx: (Math.random() < 0.5 ? -1 : 1) * (BASE_SPEED * 0.6 + Math.random() * BASE_SPEED),
      vy: (Math.random() < 0.5 ? -1 : 1) * (BASE_SPEED * 0.6 + Math.random() * BASE_SPEED),
      flash: 0,
    }));

    const beams: Beam[] = [];
    const waves: Wave[] = [];

    let frameCount = 0;
    // Throttle corner sound: don't play more than once per 300ms
    let lastJazz = 0;

    function cornerEffect(orb: Orb) {
      orb.flash = 45;
      const now = performance.now();
      if (now - lastJazz > 300) {
        lastJazz = now;
        try { playJazz(audio()); } catch { /* audio blocked */ }
      }
      // Spawn 8 rainbow beams
      for (let i = 0; i < 8; i++) {
        beams.push({
          ox: orb.x, oy: orb.y,
          angle: (i / 8) * Math.PI * 2,
          len: 0,
          maxLen: 200 + Math.random() * 250,
          color: RAINBOW[i % RAINBOW.length],
          alpha: 1,
        });
      }
    }

    function addShockwave(x: number, y: number) {
      waves.push({ x, y, r: 0, alpha: 0.9 });
      // Random max strength between two high numbers
      const strength = 45 + Math.random() * 85; // 45–130
      orbs.forEach(o => {
        const dx = o.x - x, dy = o.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 520 && d > 1) {
          const s = strength * (1 - d / 520);
          o.vx += (dx / d) * s;
          o.vy += (dy / d) * s;
        }
      });
    }

    function update() {
      frameCount++;

      // ── Orbs ──────────────────────────────────────────────
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        o.x += o.vx;
        o.y += o.vy;
        if (o.flash > 0) o.flash--;

        // Apply soft speed cap so shockwaves don't send them flying forever
        const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
        if (speed > 38) { o.vx = (o.vx / speed) * 38; o.vy = (o.vy / speed) * 38; }

        let hx = false, hy = false;
        if (o.x - o.r < 0) { o.x = o.r; o.vx = Math.abs(o.vx); hx = true; }
        if (o.x + o.r > W) { o.x = W - o.r; o.vx = -Math.abs(o.vx); hx = true; }
        if (o.y - o.r < 0) { o.y = o.r; o.vy = Math.abs(o.vy); hy = true; }
        if (o.y + o.r > H) { o.y = H - o.r; o.vy = -Math.abs(o.vy); hy = true; }

        if (hx && hy) cornerEffect(o);

        // Orb-orb elastic collision (equal-mass)
        for (let j = i + 1; j < orbs.length; j++) {
          const b = orbs[j];
          const dx = b.x - o.x, dy = b.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minD = o.r + b.r;
          if (dist < minD && dist > 0.01) {
            const nx = dx / dist, ny = dy / dist;
            // Separate so they don't overlap
            const overlap = (minD - dist) * 0.5;
            o.x -= nx * overlap; o.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            // Velocity exchange along collision normal
            const relVn = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
            if (relVn > 0) { // only if approaching
              o.vx -= relVn * nx; o.vy -= relVn * ny;
              b.vx += relVn * nx; b.vy += relVn * ny;
            }
          }
        }
      }

      // ── Beams ─────────────────────────────────────────────
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        if (b.len < b.maxLen) {
          b.len += 11;
        } else {
          b.alpha -= 0.032;
          if (b.alpha <= 0) { beams.splice(i, 1); continue; }
        }

        // Check if beam endpoint region intersects any orb → impulse
        const ex = b.ox + Math.cos(b.angle) * b.len;
        const ey = b.oy + Math.sin(b.angle) * b.len;
        const segDx = ex - b.ox, segDy = ey - b.oy;
        const segLen2 = segDx * segDx + segDy * segDy;

        orbs.forEach(o => {
          if (segLen2 < 0.01) return;
          const t = Math.max(0, Math.min(1,
            ((o.x - b.ox) * segDx + (o.y - b.oy) * segDy) / segLen2
          ));
          const cx = b.ox + t * segDx - o.x;
          const cy = b.oy + t * segDy - o.y;
          if (Math.sqrt(cx * cx + cy * cy) < o.r + 6) {
            o.vx += Math.cos(b.angle) * 2.2;
            o.vy += Math.sin(b.angle) * 2.2;
          }
        });
      }

      // ── Waves ─────────────────────────────────────────────
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.r += 15;
        w.alpha -= 0.033;
        if (w.alpha <= 0) waves.splice(i, 1);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Beams
      beams.forEach(b => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.alpha);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 16;
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
        ctx.strokeStyle = '#bf5fff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        ctx.stroke();
        // inner ring
        ctx.globalAlpha = Math.max(0, w.alpha * 0.4);
        ctx.beginPath();
        ctx.arc(w.x, w.y, Math.max(0, w.r - 18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // Orbs
      orbs.forEach(o => {
        const fc = o.flash > 0 ? RAINBOW[Math.floor(frameCount / 4) % RAINBOW.length] : o.color;
        ctx.save();
        ctx.shadowColor = fc;
        ctx.shadowBlur = o.flash > 0 ? 50 : 24;

        // Glow fill
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fillStyle = fc + '20';
        ctx.fill();

        // Border
        ctx.strokeStyle = fc;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Second border ring when flashing
        if (o.flash > 0) {
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = RAINBOW[(Math.floor(frameCount / 4) + 3) % RAINBOW.length];
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Piece glyph
        ctx.shadowBlur = 0;
        ctx.fillStyle = fc;
        ctx.font = `${Math.round(o.r * 0.88)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(o.piece, o.x, o.y);

        ctx.restore();
      });
    }

    let raf: number;
    function loop() {
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onClick(e: MouseEvent) {
      addShockwave(e.clientX, e.clientY);
    }
    function onResize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
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
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        display: 'block',
        width: '100%', height: '100%',
      }}
    />
  );
}
