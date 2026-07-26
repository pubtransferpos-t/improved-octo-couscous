import { useState, useEffect, useRef, useCallback } from 'react';
import { Color } from 'chess.js';
import { EFFECTS, EffectType, RARITY_CONFIG, Rarity } from '@/hooks/gambit-engine';

// ── Tier ordering ─────────────────────────────────────────────────────────────

const TIER_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'broken', 'godly'];

/**
 * How many UPGRADE segments to interleave in each tier's wheel.
 * More = higher chance of upgrading to next rarity.
 * Godly = 0, no further upgrade.
 */
const UPGRADE_SLOT_COUNT: Partial<Record<Rarity, number>> = {
  common:    2,  // ≈18% with 9 commons
  rare:      2,  // ≈22% with 7 rares
  epic:      2,  // ≈25% with 6 epics
  legendary: 1,  // ≈13% with 7 legendaries
  broken:    1,  // ≈17% with 5 brokens
  godly:     0,
};

type WheelSlot = EffectType | 'UPGRADE';

const UPGRADE_BG   = '#4a3200';
const UPGRADE_GOLD = '#ffd700';
const UPGRADE_GLOW = '#ffe566';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTierSlots(enabledEffects: EffectType[], tier: Rarity): WheelSlot[] {
  const tierEffects = enabledEffects.filter(e => EFFECTS[e].rarity === tier);
  if (tierEffects.length === 0) return [];

  const upgradeCount = UPGRADE_SLOT_COUNT[tier] ?? 0;
  if (upgradeCount === 0) return [...tierEffects];

  // Spread upgrade slots evenly among effects
  const slots: WheelSlot[] = [...tierEffects];
  const step = Math.floor(slots.length / upgradeCount);
  for (let i = 0; i < upgradeCount; i++) {
    const insertAt = Math.min(step * i + Math.floor(step / 2), slots.length);
    slots.splice(insertAt + i, 0, 'UPGRADE');
  }
  return slots;
}

function getFirstAvailableTier(enabledEffects: EffectType[]): Rarity {
  for (const tier of TIER_ORDER) {
    if (enabledEffects.some(e => EFFECTS[e].rarity === tier)) return tier;
  }
  return 'common';
}

function getNextAvailableTier(currentTier: Rarity, enabledEffects: EffectType[]): Rarity | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  for (let i = idx + 1; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i];
    if (enabledEffects.some(e => EFFECTS[e].rarity === tier)) return tier;
  }
  return null;
}

function selectSlot(slots: WheelSlot[]): WheelSlot {
  return slots[Math.floor(Math.random() * slots.length)];
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function getSegmentPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const rad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(rad(start)), y1 = cy + r * Math.sin(rad(start));
  const x2 = cx + r * Math.cos(rad(end)),   y2 = cy + r * Math.sin(rad(end));
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function getTextPos(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#374151', rare: '#1e3a8a', epic: '#5b21b6',
  legendary: '#92400e', broken: '#991b1b', godly: '#831843',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface SpinWheelProps {
  spinningFor: Color;
  enabledEffects: EffectType[];
  onEffect: (effect: EffectType) => void;
}

type Phase = 'ready' | 'spinning' | 'tier-up' | 'revealed';

export default function SpinWheel({ spinningFor, enabledEffects, onEffect }: SpinWheelProps) {
  const firstTier = getFirstAvailableTier(enabledEffects);

  const [currentTier, setCurrentTier] = useState<Rarity>(firstTier);
  const [slots, setSlots] = useState<WheelSlot[]>(() => buildTierSlots(enabledEffects, firstTier));
  const [phase, setPhase] = useState<Phase>('ready');
  const [rotation, setRotation] = useState(0);
  const [chosenSlot, setChosenSlot] = useState<WheelSlot | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [tierUpLabel, setTierUpLabel] = useState('');

  const animRef   = useRef<number | null>(null);
  const startRef  = useRef(0);
  const targetRef = useRef(0);
  const durRef    = useRef(4000);
  const rotRef    = useRef(0); // always mirrors rotation state for callbacks

  const playerLabel = spinningFor === 'w' ? 'WHITE' : 'BLACK';
  const playerColor = spinningFor === 'w' ? '#ffee00' : '#00f5ff';
  const tierCfg = RARITY_CONFIG[currentTier];

  const N = slots.length || 1;
  const segAngle = 360 / N;
  const CX = 200, CY = 200, R = 185, R_INNER = 32, R_TEXT = 145;

  // ── Spin animation ──────────────────────────────────────────────────────────
  const doSpin = useCallback((slotsToUse: WheelSlot[], fromRot: number) => {
    if (slotsToUse.length === 0) return;

    const chosen = selectSlot(slotsToUse);
    const idx = slotsToUse.indexOf(chosen);
    const sa = 360 / slotsToUse.length;
    const extraSpins = 6 + Math.floor(Math.random() * 4);
    const targetAngle = extraSpins * 360 + (360 - (idx + 0.5) * sa);

    targetRef.current = fromRot + targetAngle;
    durRef.current = 3500 + Math.random() * 1500;

    setPhase('spinning');
    setChosenSlot(null);
    startRef.current = performance.now();

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const nSlots = slotsToUse.length;
    const sa2 = 360 / nSlots;

    const animate = (now: number) => {
      const t = Math.min((now - startRef.current) / durRef.current, 1);
      const eased = easeOut(t);
      const newRot = fromRot + eased * targetAngle;

      setRotation(newRot);
      rotRef.current = newRot;
      setHighlight(Math.floor(((360 - ((newRot % 360) + 360) % 360) % 360) / sa2) % nSlots);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setRotation(targetRef.current);
        rotRef.current = targetRef.current;
        setChosenSlot(chosen);
        if (chosen === 'UPGRADE') {
          setTimeout(() => setPhase('tier-up'), 400);
        } else {
          setTimeout(() => setPhase('revealed'), 350);
        }
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Tier-up handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'tier-up') return;

    const nextTier = getNextAvailableTier(currentTier, enabledEffects);

    if (!nextTier) {
      // At the top — spin again without upgrade slots
      const pure = enabledEffects.filter(e => EFFECTS[e].rarity === currentTier) as WheelSlot[];
      setTierUpLabel('🌀 No higher tier — spinning again!');
      const t = setTimeout(() => {
        setTierUpLabel('');
        setSlots(pure);
        setPhase('ready');
        setTimeout(() => doSpin(pure, rotRef.current), 80);
      }, 1600);
      return () => clearTimeout(t);
    }

    const nextSlots = buildTierSlots(enabledEffects, nextTier);
    const nextCfg = RARITY_CONFIG[nextTier];
    setTierUpLabel(`⬆ TIER UP! ${nextCfg.label}!`);

    const t = setTimeout(() => {
      setCurrentTier(nextTier);
      setSlots(nextSlots);
      setTierUpLabel('');
      setPhase('ready');
      setTimeout(() => doSpin(nextSlots, rotRef.current), 80);
    }, 1800);
    return () => clearTimeout(t);
  }, [phase, currentTier, enabledEffects, doSpin]);

  // Cleanup
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const handleSpin = () => { if (phase === 'ready') doSpin(slots, rotation); };
  const handleApply = () => { if (chosenSlot && chosenSlot !== 'UPGRADE') onEffect(chosenSlot); };

  const chosenEffect = (chosenSlot && chosenSlot !== 'UPGRADE') ? EFFECTS[chosenSlot] : null;
  const chosenCfg = chosenEffect ? RARITY_CONFIG[chosenEffect.rarity] : null;
  const isBuff = chosenEffect?.category === 'buff';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(5,2,20,0.96)',
      backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0, overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.5rem', letterSpacing: '0.2em',
          color: 'rgba(200,190,255,0.4)', marginBottom: 3,
        }}>🎰 IT&apos;S SPIN TIME</div>

        <div style={{
          fontFamily: '"Permanent Marker", cursive', fontSize: '2rem',
          color: playerColor, filter: `drop-shadow(0 0 20px ${playerColor}88)`,
        }}>{playerLabel}</div>

        {/* Tier progress dots */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 3, marginTop: 5,
        }}>
          {TIER_ORDER.filter(t => enabledEffects.some(e => EFFECTS[e].rarity === t)).map((tier, idx, arr) => {
            const tierIdx = TIER_ORDER.indexOf(tier);
            const curIdx  = TIER_ORDER.indexOf(currentTier);
            const isActive = tier === currentTier;
            const isPast   = tierIdx < curIdx;
            const cfg = RARITY_CONFIG[tier];
            return (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {idx > 0 && (
                  <div style={{
                    width: 14, height: 2, borderRadius: 1,
                    background: isPast ? cfg.glow : 'rgba(255,255,255,0.15)',
                    transition: 'background 0.4s',
                  }} />
                )}
                <div style={{
                  width: isActive ? 11 : 7, height: isActive ? 11 : 7, borderRadius: '50%',
                  background: isActive ? cfg.glow : isPast ? cfg.color : 'rgba(255,255,255,0.15)',
                  boxShadow: isActive ? `0 0 10px ${cfg.glow}` : 'none',
                  transition: 'all 0.35s',
                }} />
                {isActive && idx === arr.length - 1 && (
                  <span style={{
                    fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
                    color: cfg.glow, marginLeft: 5,
                    filter: `drop-shadow(0 0 4px ${cfg.glow})`,
                  }}>{cfg.label}</span>
                )}
              </div>
            );
          })}
          {!TIER_ORDER.filter(t => enabledEffects.some(e => EFFECTS[e].rarity === t)).some(t => t === currentTier) || (
            <span style={{
              fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
              color: tierCfg.glow, marginLeft: 5,
              filter: `drop-shadow(0 0 4px ${tierCfg.glow})`,
            }}>{tierCfg.label}</span>
          )}
        </div>
      </div>

      {/* ── Tier-up overlay ── */}
      {phase === 'tier-up' && tierUpLabel && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10,
          background: 'rgba(5,2,20,0.88)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            fontFamily: '"Permanent Marker", cursive', fontSize: '2.8rem',
            color: UPGRADE_GOLD,
            filter: `drop-shadow(0 0 30px ${UPGRADE_GLOW})`,
            textAlign: 'center', animation: 'bob 0.6s ease-in-out infinite',
            lineHeight: 1.2,
          }}>{tierUpLabel}</div>
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.48rem',
            color: 'rgba(200,190,255,0.5)', letterSpacing: '0.1em', marginTop: 4,
          }}>spinning next tier...</div>
        </div>
      )}

      {/* ── Wheel ── */}
      <div style={{ position: 'relative', width: 400, height: 400, flexShrink: 0 }}>
        {/* Pointer */}
        <div style={{
          position: 'absolute', top: -2, left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
          filter: 'drop-shadow(0 0 8px #fff)',
        }}>
          <svg width="24" height="28" viewBox="0 0 24 28">
            <polygon points="12,28 0,0 24,0" fill="#fff" opacity="0.95" />
          </svg>
        </div>

        {/* Glow ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          boxShadow: phase === 'spinning'
            ? '0 0 60px rgba(191,95,255,0.5), 0 0 120px rgba(191,95,255,0.2)'
            : chosenEffect
              ? `0 0 60px ${chosenCfg!.glow}88, 0 0 120px ${chosenCfg!.glow}33`
              : chosenSlot === 'UPGRADE'
                ? `0 0 60px ${UPGRADE_GLOW}88, 0 0 120px ${UPGRADE_GLOW}44`
                : `0 0 40px ${tierCfg.glow}44`,
          transition: 'box-shadow 0.5s',
        }} />

        <svg
          width="400" height="400" viewBox="0 0 400 400"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: phase === 'spinning' ? 'none' : 'transform 0.3s ease-out',
            cursor: phase === 'ready' ? 'pointer' : 'default',
          }}
          onClick={phase === 'ready' ? handleSpin : undefined}
        >
          <defs>
            <radialGradient id="upgradeGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7a5500" />
              <stop offset="100%" stopColor="#3a2800" />
            </radialGradient>
          </defs>

          {slots.map((slot, i) => {
            const sa = i * segAngle, ea = (i + 1) * segAngle, ma = sa + segAngle / 2;
            const isUpgrade = slot === 'UPGRADE';
            const ef = isUpgrade ? null : EFFECTS[slot as EffectType];
            const isHot = i === highlight && phase === 'spinning';
            const tp = getTextPos(CX, CY, R_TEXT, ma);

            return (
              <g key={`${slot}-${i}`}>
                <path
                  d={getSegmentPath(CX, CY, R, sa, ea)}
                  fill={isUpgrade ? 'url(#upgradeGrad)' : RARITY_COLORS[ef!.rarity]}
                  opacity={isHot ? 1 : 0.82}
                  stroke="#0d0a1a" strokeWidth={1.5}
                />
                {N <= 64 && (
                  <text
                    x={tp.x} y={tp.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={N <= 18 ? 18 : N <= 32 ? 13 : N <= 50 ? 10 : 8}
                    transform={`rotate(${ma}, ${tp.x}, ${tp.y})`}
                    fill={isUpgrade ? UPGRADE_GOLD : '#fff'}
                    fontWeight={isUpgrade ? 'bold' : 'normal'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {isUpgrade ? '⬆' : ef!.emoji}
                  </text>
                )}
              </g>
            );
          })}

          <circle cx={CX} cy={CY} r={R_INNER} fill="#0d0a1a" stroke={tierCfg.color} strokeWidth={2.5} />
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle" fontSize="18" fill={tierCfg.glow}>
            🎰
          </text>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(191,95,255,0.4)" strokeWidth={2} />
        </svg>

        {phase === 'ready' && (
          <div onClick={handleSpin} style={{
            position: 'absolute', inset: 0, borderRadius: '50%', cursor: 'pointer',
          }} />
        )}
      </div>

      {/* ── Result / CTA ── */}
      {phase === 'revealed' && chosenEffect && chosenCfg ? (
        <div className="animate-bounce-in" style={{
          marginTop: 8, width: '100%', maxWidth: 360, padding: '16px 20px',
          background: `linear-gradient(135deg, ${chosenCfg.color}15, ${chosenCfg.color}05)`,
          border: `2px solid ${chosenCfg.color}`,
          borderRadius: 16, textAlign: 'center',
          boxShadow: `0 0 30px ${chosenCfg.glow}44`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
            letterSpacing: '0.15em', color: chosenCfg.color,
            background: `${chosenCfg.color}20`,
            border: `1px solid ${chosenCfg.color}60`,
            borderRadius: 20, padding: '3px 10px',
            filter: `drop-shadow(0 0 6px ${chosenCfg.glow})`,
          }}>✦ {chosenCfg.label} ✦</div>

          <div style={{ fontSize: '2.2rem' }}>{chosenEffect.emoji}</div>

          <div style={{
            fontFamily: '"Permanent Marker", cursive', fontSize: '1.6rem',
            color: chosenCfg.glow, filter: `drop-shadow(0 0 8px ${chosenCfg.glow})`,
          }}>{chosenEffect.label}</div>

          <div style={{
            fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem',
            color: isBuff ? '#39ff14' : '#ff2d78', letterSpacing: '0.06em',
          }}>{isBuff ? '⬆ BUFF' : '⬇ NERF'}</div>

          <div style={{
            fontFamily: '"Boogaloo", sans-serif', fontSize: '0.88rem',
            color: 'rgba(200,190,255,0.7)', lineHeight: 1.4,
          }}>{chosenEffect.description}</div>

          <button onClick={handleApply} style={{
            marginTop: 4, width: '100%', padding: '12px 0',
            fontFamily: '"Permanent Marker", cursive', fontSize: '1.3rem',
            background: isBuff
              ? 'linear-gradient(135deg, #39ff14, #00d4aa)'
              : 'linear-gradient(135deg, #ff2d78, #ff6b00)',
            color: '#fff', border: 'none', borderRadius: 12,
            cursor: 'pointer',
            boxShadow: `0 0 20px ${isBuff ? 'rgba(57,255,20,0.4)' : 'rgba(255,45,120,0.4)'}`,
            animation: 'bob 1s ease-in-out infinite',
          }}>
            {chosenEffect.emoji} Apply: {chosenEffect.label}!
          </button>
        </div>
      ) : phase === 'ready' ? (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <button onClick={handleSpin} style={{
            padding: '14px 48px',
            fontFamily: '"Permanent Marker", cursive', fontSize: '1.8rem',
            background: 'linear-gradient(135deg, #ff2d78, #ff9900, #ffee00)',
            color: '#fff', border: 'none', borderRadius: 20, cursor: 'pointer',
            boxShadow: '0 0 30px rgba(255,45,120,0.5)', transition: 'all 0.15s',
          }}>🎰 SPIN!</button>
          <div style={{
            marginTop: 8,
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem',
            color: 'rgba(200,190,255,0.3)', letterSpacing: '0.1em',
          }}>click the wheel or press SPIN</div>
        </div>
      ) : phase === 'spinning' ? (
        <div style={{ marginTop: 8 }}>
          <div style={{
            padding: '14px 48px',
            fontFamily: '"Permanent Marker", cursive', fontSize: '1.8rem',
            color: 'rgba(200,190,255,0.4)', background: 'rgba(200,190,255,0.06)',
            border: '2px solid rgba(200,190,255,0.2)', borderRadius: 20,
          }}>🌀 Spinning...</div>
        </div>
      ) : null}

      {/* ── Bottom legend ── */}
      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        padding: '5px 10px', background: 'rgba(0,0,0,0.5)', borderRadius: 20,
      }}>
        {TIER_ORDER.filter(r => enabledEffects.some(e => EFFECTS[e].rarity === r)).map(r => {
          const count = enabledEffects.filter(e => EFFECTS[e].rarity === r).length;
          const isActive = r === currentTier;
          return (
            <div key={r} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontFamily: '"Press Start 2P", monospace', fontSize: '0.36rem',
              color: isActive ? RARITY_CONFIG[r].glow : RARITY_CONFIG[r].color,
              opacity: isActive ? 1 : 0.55, transition: 'all 0.3s',
            }}>
              <div style={{
                width: isActive ? 9 : 7, height: isActive ? 9 : 7, borderRadius: 2,
                background: RARITY_COLORS[r], border: `1px solid ${RARITY_CONFIG[r].color}`,
              }} />
              {RARITY_CONFIG[r].label} ({count})
            </div>
          );
        })}
        {slots.some(s => s === 'UPGRADE') && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.36rem',
            color: UPGRADE_GOLD,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: UPGRADE_BG, border: `1px solid ${UPGRADE_GOLD}` }} />
            ⬆ UPGRADE
          </div>
        )}
      </div>
    </div>
  );
}
