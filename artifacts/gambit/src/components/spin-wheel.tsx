import { useState, useEffect, useRef } from 'react';
import { Color } from 'chess.js';
import { EFFECTS, EffectType, RARITY_CONFIG, Rarity, selectWeightedEffect } from '@/hooks/gambit-engine';

interface SpinWheelProps {
  spinningFor: Color;
  enabledEffects: EffectType[];
  onEffect: (effect: EffectType) => void;
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'broken', 'godly'];

function getSegmentPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function getTextPosition(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

export default function SpinWheel({ spinningFor, enabledEffects, onEffect }: SpinWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [chosen, setChosen] = useState<EffectType | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(0);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const targetRotationRef = useRef(0);
  const totalDurationRef = useRef(4000);

  const N = enabledEffects.length;
  const segAngle = 360 / N;
  const CX = 200, CY = 200, R = 185, R_INNER = 30;
  const R_TEXT = 140;

  const playerLabel = spinningFor === 'w' ? 'WHITE' : 'BLACK';
  const playerColor = spinningFor === 'w' ? '#ffee00' : '#00f5ff';

  const effectDef = chosen ? EFFECTS[chosen] : null;
  const rarity = effectDef?.rarity ?? 'common';
  const rarityConfig = RARITY_CONFIG[rarity];
  const isBuff = effectDef?.category === 'buff';

  const RARITY_COLORS: Record<Rarity, string> = {
    common:    '#4b5563',
    rare:      '#1d4ed8',
    epic:      '#7c3aed',
    legendary: '#b45309',
    broken:    '#b91c1c',
    godly:     '#9d174d',
  };

  const RARITY_GLOW: Record<Rarity, string> = {
    common:    '#9ca3af',
    rare:      '#60a5fa',
    epic:      '#c084fc',
    legendary: '#fcd34d',
    broken:    '#f87171',
    godly:     '#f9a8d4',
  };

  const spin = () => {
    if (spinning || chosen) return;
    const finalEffect = selectWeightedEffect(enabledEffects);
    const finalIdx = enabledEffects.indexOf(finalEffect);

    // Calculate target rotation: many full spins + land on segment
    const extraSpins = 6 + Math.floor(Math.random() * 4); // 6-9 full rotations
    const targetAngle = extraSpins * 360 + (360 - (finalIdx + 0.5) * segAngle);
    targetRotationRef.current = rotation + targetAngle;
    totalDurationRef.current = 4000 + Math.random() * 1500;

    setSpinning(true);
    setChosen(null);
    setRevealed(false);
    startTimeRef.current = performance.now();

    // Easing: cubic ease out
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / totalDurationRef.current, 1);
      const easedT = easeOut(t);
      const currentRot = rotation + easedT * targetAngle;
      setRotation(currentRot);

      // Highlight current segment under pointer
      const normalizedRot = ((currentRot % 360) + 360) % 360;
      const idx = Math.floor(((360 - normalizedRot) % 360) / segAngle) % N;
      setCurrentHighlight(idx);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setRotation(targetRotationRef.current);
        setSpinning(false);
        setChosen(finalEffect);
        setTimeout(() => setRevealed(true), 300);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  // Compute rarity counts for legend
  const rarityCounts = enabledEffects.reduce((acc, e) => {
    const r = EFFECTS[e].rarity;
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {} as Record<Rarity, number>);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(5,2,20,0.95)',
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8, zIndex: 2 }}>
        <div style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.55rem', letterSpacing: '0.2em',
          color: 'rgba(200,190,255,0.4)', marginBottom: 4,
        }}>🎰 IT&apos;S SPIN TIME</div>
        <div style={{
          fontFamily: '"Permanent Marker", cursive',
          fontSize: '2rem',
          color: playerColor,
          filter: `drop-shadow(0 0 20px ${playerColor}88)`,
        }}>{playerLabel}</div>
      </div>

      {/* Wheel area */}
      <div style={{ position: 'relative', width: 400, height: 400, flexShrink: 0 }}>
        {/* Pointer */}
        <div style={{
          position: 'absolute', top: -2, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10, filter: 'drop-shadow(0 0 8px #fff)',
        }}>
          <svg width="24" height="28" viewBox="0 0 24 28">
            <polygon points="12,28 0,0 24,0" fill="#fff" opacity="0.95" />
          </svg>
        </div>

        {/* Outer glow ring */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          boxShadow: spinning
            ? '0 0 60px rgba(191,95,255,0.5), 0 0 120px rgba(191,95,255,0.2)'
            : chosen
              ? `0 0 60px ${rarityConfig.glow}88, 0 0 120px ${rarityConfig.glow}33`
              : '0 0 40px rgba(191,95,255,0.3)',
          transition: 'box-shadow 0.5s',
          pointerEvents: 'none',
        }} />

        <svg
          width="400" height="400"
          viewBox="0 0 400 400"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'none' : 'transform 0.3s ease-out',
            cursor: !spinning && !chosen ? 'pointer' : 'default',
          }}
          onClick={!spinning && !chosen ? spin : undefined}
        >
          {/* Segments */}
          {enabledEffects.map((effectType, i) => {
            const startAngle = i * segAngle;
            const endAngle = (i + 1) * segAngle;
            const midAngle = startAngle + segAngle / 2;
            const ef = EFFECTS[effectType];
            const rarColor = RARITY_COLORS[ef.rarity];
            const isHighlighted = i === currentHighlight && spinning;
            const textPos = getTextPosition(CX, CY, R_TEXT, midAngle);
            const textAngle = midAngle;

            return (
              <g key={effectType}>
                <path
                  d={getSegmentPath(CX, CY, R, startAngle, endAngle)}
                  fill={rarColor}
                  opacity={isHighlighted ? 1 : 0.75}
                  stroke="#0d0a1a"
                  strokeWidth={1.5}
                />
                {/* Emoji label if segment is big enough */}
                {N <= 60 && (
                  <text
                    x={textPos.x}
                    y={textPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={N <= 20 ? 18 : N <= 35 ? 12 : 9}
                    transform={`rotate(${textAngle}, ${textPos.x}, ${textPos.y})`}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {ef.emoji}
                  </text>
                )}
              </g>
            );
          })}

          {/* Inner circle */}
          <circle cx={CX} cy={CY} r={R_INNER} fill="#0d0a1a" stroke="#bf5fff" strokeWidth={2} />
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="#bf5fff">
            🎰
          </text>

          {/* Outer border ring */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(191,95,255,0.5)" strokeWidth={2} />
        </svg>

        {/* Center click area when ready */}
        {!spinning && !chosen && (
          <div
            onClick={spin}
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          />
        )}
      </div>

      {/* Result reveal */}
      {chosen && revealed && effectDef ? (
        <div
          className="animate-bounce-in"
          style={{
            marginTop: 8,
            width: '100%', maxWidth: 360, padding: '16px 20px',
            background: `linear-gradient(135deg, ${rarityConfig.color}15, ${rarityConfig.color}05)`,
            border: `2px solid ${rarityConfig.color}`,
            borderRadius: 16, textAlign: 'center',
            boxShadow: `0 0 30px ${rarityConfig.glow}44`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          {/* Rarity badge */}
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
            letterSpacing: '0.15em', color: rarityConfig.color,
            background: `${rarityConfig.color}20`,
            border: `1px solid ${rarityConfig.color}60`,
            borderRadius: 20, padding: '3px 10px',
            filter: `drop-shadow(0 0 6px ${rarityConfig.glow})`,
          }}>
            ✦ {rarityConfig.label} ✦
          </div>

          <div style={{ fontSize: '2rem' }}>{effectDef.emoji}</div>

          <div style={{
            fontFamily: '"Permanent Marker", cursive',
            fontSize: '1.6rem',
            color: rarityConfig.glow,
            filter: `drop-shadow(0 0 8px ${rarityConfig.glow})`,
          }}>
            {effectDef.label}
          </div>

          <div style={{
            fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem',
            color: isBuff ? '#39ff14' : '#ff2d78', letterSpacing: '0.06em',
          }}>
            {isBuff ? '⬆ BUFF' : '⬇ NERF'}
          </div>

          <div style={{
            fontFamily: '"Boogaloo", sans-serif', fontSize: '0.88rem',
            color: 'rgba(200,190,255,0.7)', lineHeight: 1.4,
          }}>
            {effectDef.description}
          </div>

          <button
            onClick={() => onEffect(chosen)}
            style={{
              marginTop: 4,
              width: '100%', padding: '12px 0',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '1.3rem',
              background: isBuff
                ? 'linear-gradient(135deg, #39ff14, #00d4aa)'
                : 'linear-gradient(135deg, #ff2d78, #ff6b00)',
              color: '#fff', border: 'none', borderRadius: 12,
              cursor: 'pointer',
              boxShadow: `0 0 20px ${isBuff ? 'rgba(57,255,20,0.4)' : 'rgba(255,45,120,0.4)'}`,
              animation: 'bob 1s ease-in-out infinite',
            }}
          >
            {effectDef.emoji} Apply: {effectDef.label}!
          </button>
        </div>
      ) : !chosen ? (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <button
            onClick={spin}
            disabled={spinning}
            style={{
              padding: '14px 48px',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '1.8rem',
              background: spinning
                ? 'rgba(200,190,255,0.1)'
                : 'linear-gradient(135deg, #ff2d78, #ff9900, #ffee00)',
              color: spinning ? 'rgba(200,190,255,0.5)' : '#fff',
              border: spinning ? '2px solid rgba(200,190,255,0.2)' : 'none',
              borderRadius: 20,
              cursor: spinning ? 'not-allowed' : 'pointer',
              boxShadow: spinning ? 'none' : '0 0 30px rgba(255,45,120,0.5)',
              transition: 'all 0.15s',
            }}
          >
            {spinning ? '🌀 Spinning...' : '🎰 SPIN!'}
          </button>
          <div style={{
            marginTop: 8,
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem',
            color: 'rgba(200,190,255,0.3)', letterSpacing: '0.1em',
          }}>
            click the wheel or press SPIN
          </div>
        </div>
      ) : null}

      {/* Rarity legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
        padding: '6px 12px',
        background: 'rgba(0,0,0,0.5)', borderRadius: 20,
      }}>
        {RARITY_ORDER.filter(r => rarityCounts[r]).map(r => (
          <div key={r} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
            color: RARITY_CONFIG[r].color,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: RARITY_COLORS[r],
              border: `1px solid ${RARITY_CONFIG[r].color}`,
            }} />
            {RARITY_CONFIG[r].label} ({rarityCounts[r]})
          </div>
        ))}
      </div>
    </div>
  );
}

