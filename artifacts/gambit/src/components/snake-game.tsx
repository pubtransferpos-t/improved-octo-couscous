import { useEffect, useRef } from 'react';

const CELL = 26;
const TICK_MS = 140;
const MAX_HP = 100;
const REGEN = 15;
const DAMAGE = 10;
const FLASH_TICKS = 6;

const APPLE_DEFS = [
  { piece: '♕', color: '#ff2d78', type: 'Q' as const },
  { piece: '♞', color: '#00f5ff', type: 'N' as const },
  { piece: '♜', color: '#39ff14', type: 'R' as const },
  { piece: '♝', color: '#bf5fff', type: 'B' as const },
  { piece: '♛', color: '#ffee00', type: 'Q' as const },
  { piece: '♟', color: '#ff6b00', type: 'P' as const },
];

type PieceType = 'Q' | 'N' | 'R' | 'B' | 'P' | 'K';

interface Apple {
  x: number; y: number;
  vx: number; vy: number;
  piece: string;
  color: string;
  type: PieceType;
}

interface Seg { x: number; y: number; }

interface State {
  snake: Seg[];
  dir: Seg;
  nextDir: Seg;
  apples: Apple[];
  hp: number;
  score: number;
  over: boolean;
  flash: Seg[];
  flashTicks: number;
  cols: number;
  rows: number;
  touchStart: { x: number; y: number } | null;
}

function attacked(type: PieceType, gx: number, gy: number, cols: number, rows: number): Seg[] {
  const out: Seg[] = [];
  const add = (x: number, y: number) => { if (x >= 0 && x < cols && y >= 0 && y < rows) out.push({ x, y }); };
  const slide = (dx: number, dy: number) => {
    let x = gx + dx, y = gy + dy;
    while (x >= 0 && x < cols && y >= 0 && y < rows) { out.push({ x, y }); x += dx; y += dy; }
  };
  switch (type) {
    case 'P': add(gx-1,gy-1); add(gx+1,gy-1); add(gx-1,gy+1); add(gx+1,gy+1); break;
    case 'N':
      for (const [dx,dy] of [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[1,-2],[-1,2],[1,2]])
        add(gx+dx, gy+dy);
      break;
    case 'B': slide(-1,-1); slide(1,-1); slide(-1,1); slide(1,1); break;
    case 'R': slide(-1,0); slide(1,0); slide(0,-1); slide(0,1); break;
    case 'Q':
      slide(-1,-1); slide(1,-1); slide(-1,1); slide(1,1);
      slide(-1,0); slide(1,0); slide(0,-1); slide(0,1); break;
    case 'K':
      for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++)
        if (dx||dy) add(gx+dx, gy+dy);
      break;
  }
  return out;
}

function makeState(W: number, H: number): State {
  const cols = Math.floor(W / CELL);
  const rows = Math.floor(H / CELL);
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  return {
    snake: [{ x:cx, y:cy }, { x:cx-1, y:cy }, { x:cx-2, y:cy }],
    dir: { x:1, y:0 },
    nextDir: { x:1, y:0 },
    apples: APPLE_DEFS.map((def, i) => ({
      x: 2 + ((i * 11) % (cols - 4)),
      y: 2 + ((i * 7)  % (rows - 4)),
      vx: (i % 2 === 0 ? 1 : -1) * (0.11 + (i % 3) * 0.04),
      vy: (i % 3 === 0 ? 1 : -1) * (0.09 + (i % 4) * 0.03),
      ...def,
    })),
    hp: MAX_HP,
    score: 0,
    over: false,
    flash: [],
    flashTicks: 0,
    cols,
    rows,
    touchStart: null,
  };
}

export default function SnakeGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<State | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    stateRef.current = makeState(W, H);

    function draw() {
      const s = stateRef.current!;
      const ctx = canvas.getContext('2d')!;

      // Background
      ctx.fillStyle = 'rgba(5,3,14,0.92)';
      ctx.fillRect(0, 0, W, H);

      // Faint grid
      ctx.strokeStyle = 'rgba(100,60,180,0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= s.cols; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
      }
      for (let y = 0; y <= s.rows; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
      }

      // Attack flash
      if (s.flashTicks > 0 && s.flash.length > 0) {
        const a = s.flashTicks / FLASH_TICKS;
        ctx.fillStyle = `rgba(255,45,120,${a * 0.38})`;
        for (const sq of s.flash) ctx.fillRect(sq.x*CELL+1, sq.y*CELL+1, CELL-2, CELL-2);
        ctx.strokeStyle = `rgba(255,45,120,${a * 0.9})`;
        ctx.lineWidth = 1.5;
        for (const sq of s.flash) ctx.strokeRect(sq.x*CELL+1, sq.y*CELL+1, CELL-2, CELL-2);
      }

      // Snake body
      for (let i = s.snake.length - 1; i >= 1; i--) {
        const seg = s.snake[i];
        const fade = 1 - (i / s.snake.length) * 0.55;
        ctx.fillStyle = `rgba(0,220,255,${fade * 0.75})`;
        const p = 4;
        ctx.beginPath();
        ctx.roundRect(seg.x*CELL+p, seg.y*CELL+p, CELL-p*2, CELL-p*2, 5);
        ctx.fill();
      }

      // Snake head
      if (s.snake.length > 0) {
        const h = s.snake[0];
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#00f5ff';
        const p = 2;
        ctx.beginPath();
        ctx.roundRect(h.x*CELL+p, h.y*CELL+p, CELL-p*2, CELL-p*2, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Eyes
        ctx.fillStyle = '#050310';
        const ex = h.x*CELL + CELL/2 + s.dir.x * 5;
        const ey = h.y*CELL + CELL/2 + s.dir.y * 5;
        ctx.beginPath(); ctx.arc(ex + s.dir.y*3.5, ey - s.dir.x*3.5, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - s.dir.y*3.5, ey + s.dir.x*3.5, 2, 0, Math.PI*2); ctx.fill();
      }

      // Apples
      for (const apple of s.apples) {
        const px = apple.x * CELL + CELL/2;
        const py = apple.y * CELL + CELL/2;
        const r = CELL * 0.52;
        ctx.shadowColor = apple.color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI*2);
        ctx.fillStyle = apple.color + '22';
        ctx.fill();
        ctx.strokeStyle = apple.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = apple.color;
        ctx.font = `${Math.floor(CELL * 0.68)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(apple.piece, px, py + 1);
      }

      // HUD
      const barW = 180, barH = 10, barX = 16, barY = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5); ctx.fill();
      const hpRatio = Math.max(0, s.hp / MAX_HP);
      const hpCol = hpRatio > 0.55 ? '#39ff14' : hpRatio > 0.28 ? '#ffee00' : '#ff2d78';
      ctx.shadowColor = hpCol; ctx.shadowBlur = 6;
      ctx.fillStyle = hpCol;
      ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpRatio, barH, 5); ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(200,190,255,0.7)';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`HP ${Math.max(0, s.hp)}`, barX, barY + barH + 8);

      ctx.fillStyle = '#ffee00';
      ctx.textAlign = 'right';
      ctx.fillText(`${s.score} EATEN`, W - 16, 16);

      ctx.fillStyle = 'rgba(200,190,255,0.22)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WASD / ARROWS   •   R=RESTART   •   ESC=EXIT', W/2, 18);

      // Game over
      if (s.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 40;
        ctx.fillStyle = '#ff2d78';
        ctx.font = 'bold 58px "Permanent Marker", cursive';
        ctx.fillText('GAME OVER', W/2, H/2 - 44);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,190,255,0.8)';
        ctx.font = '22px "Boogaloo", sans-serif';
        ctx.fillText(`${s.score} pieces eaten   ·   R to restart   ·   ESC to exit`, W/2, H/2 + 12);
      }
    }

    function tick() {
      const s = stateRef.current!;
      if (s.over) return;

      s.dir = { ...s.nextDir };

      // Move apples
      for (const apple of s.apples) {
        apple.x += apple.vx; apple.y += apple.vy;
        if (apple.x <= 0.5 || apple.x >= s.cols - 1.5) { apple.vx *= -1; apple.x = Math.max(0.5, Math.min(s.cols-1.5, apple.x)); }
        if (apple.y <= 0.5 || apple.y >= s.rows - 1.5) { apple.vy *= -1; apple.y = Math.max(0.5, Math.min(s.rows-1.5, apple.y)); }
      }

      if (s.flashTicks > 0) s.flashTicks--;
      if (s.flashTicks === 0) s.flash = [];

      const head = s.snake[0];
      const nh = { x: head.x + s.dir.x, y: head.y + s.dir.y };

      if (nh.x < 0 || nh.x >= s.cols || nh.y < 0 || nh.y >= s.rows) { s.over = true; return; }
      if (s.snake.slice(1).some(seg => seg.x === nh.x && seg.y === nh.y)) { s.over = true; return; }

      let ate = false;
      for (const apple of s.apples) {
        const agx = Math.round(apple.x), agy = Math.round(apple.y);
        if (agx === nh.x && agy === nh.y) {
          const atk = attacked(apple.type, agx, agy, s.cols, s.rows);
          s.flash = atk; s.flashTicks = FLASH_TICKS;
          const atkSet = new Set(atk.map(q => `${q.x},${q.y}`));
          const hits = s.snake.filter(seg => atkSet.has(`${seg.x},${seg.y}`)).length;
          s.hp = Math.min(MAX_HP, s.hp - hits * DAMAGE + REGEN);
          s.score++;
          // Respawn
          let nx: number, ny: number;
          do {
            nx = 1.5 + Math.random() * (s.cols - 3);
            ny = 1.5 + Math.random() * (s.rows - 3);
          } while (Math.abs(nx - nh.x) < 5 && Math.abs(ny - nh.y) < 5);
          apple.x = nx; apple.y = ny;
          apple.vx = (Math.random() > 0.5 ? 1 : -1) * (0.1 + Math.random() * 0.12);
          apple.vy = (Math.random() > 0.5 ? 1 : -1) * (0.09 + Math.random() * 0.1);
          ate = true; break;
        }
      }

      s.snake.unshift(nh);
      if (!ate) s.snake.pop();
      if (s.hp <= 0) { s.hp = 0; s.over = true; }
    }

    function onKey(e: KeyboardEvent) {
      const s = stateRef.current!;
      if (e.key === 'Escape') { closeRef.current(); return; }
      if ((e.key === 'r' || e.key === 'R') && s.over) {
        stateRef.current = makeState(W, H); return;
      }
      const map: Record<string, Seg> = {
        ArrowUp:{x:0,y:-1}, w:{x:0,y:-1}, W:{x:0,y:-1},
        ArrowDown:{x:0,y:1}, s:{x:0,y:1}, S:{x:0,y:1},
        ArrowLeft:{x:-1,y:0}, a:{x:-1,y:0}, A:{x:-1,y:0},
        ArrowRight:{x:1,y:0}, d:{x:1,y:0}, D:{x:1,y:0},
      };
      const nd = map[e.key];
      if (nd && !(nd.x === -s.dir.x && nd.y === -s.dir.y)) {
        s.nextDir = nd; e.preventDefault();
      }
    }

    // Touch swipe
    function onTouchStart(e: TouchEvent) {
      const s = stateRef.current!;
      s.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    function onTouchEnd(e: TouchEvent) {
      const s = stateRef.current!;
      if (!s.touchStart) return;
      const dx = e.changedTouches[0].clientX - s.touchStart.x;
      const dy = e.changedTouches[0].clientY - s.touchStart.y;
      s.touchStart = null;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      let nd: Seg;
      if (Math.abs(dx) > Math.abs(dy)) nd = dx > 0 ? {x:1,y:0} : {x:-1,y:0};
      else nd = dy > 0 ? {x:0,y:1} : {x:0,y:-1};
      if (!(nd.x === -s.dir.x && nd.y === -s.dir.y)) s.nextDir = nd;
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);

    const tickId = setInterval(tick, TICK_MS);
    let raf = 0;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    loop();

    return () => {
      clearInterval(tickId);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button
        onClick={() => closeRef.current()}
        style={{
          position: 'fixed', top: 48, right: 16,
          background: 'rgba(255,45,120,0.18)', border: '1.5px solid #ff2d78',
          borderRadius: 8, color: '#ff2d78', cursor: 'pointer',
          fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
          padding: '8px 14px', letterSpacing: '0.1em',
        }}
      >
        EXIT
      </button>
    </div>
  );
}
