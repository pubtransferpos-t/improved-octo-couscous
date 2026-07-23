import { useState } from 'react';
import { Color } from 'chess.js';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';

interface SpinWheelProps {
  spinningFor: Color;
  enabledEffects: EffectType[];
  onEffect: (effect: EffectType) => void;
}

const NEONS = ['#ff2d78','#ff9900','#ffee00','#39ff14','#00f5ff','#bf5fff'];

export default function SpinWheel({ spinningFor, enabledEffects, onEffect }: SpinWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [chosen, setChosen] = useState<EffectType | null>(null);
  const [displayIdx, setDisplayIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [spinCount, setSpinCount] = useState(0);

  const playerLabel = spinningFor === 'w' ? 'WHITE' : 'BLACK';
  const displayEffect = chosen ?? enabledEffects[displayIdx] ?? null;
  const effectDef = displayEffect ? EFFECTS[displayEffect] : null;
  const isBuff = effectDef?.category === 'buff';

  const spin = () => {
    if (spinning || chosen) return;
    setSpinning(true);
    setSpinCount(c => c + 1);

    const totalFrames = 28 + Math.floor(Math.random() * 16);
    let frame = 0;
    const finalEffect = enabledEffects[Math.floor(Math.random() * enabledEffects.length)];

    const iv = setInterval(() => {
      setDisplayIdx(i => (i + 1) % enabledEffects.length);
      setColorIdx(c => (c + 1) % NEONS.length);
      frame++;
      if (frame >= totalFrames) {
        clearInterval(iv);
        const idx = enabledEffects.indexOf(finalEffect);
        setDisplayIdx(idx >= 0 ? idx : 0);
        setChosen(finalEffect);
        setSpinning(false);
      }
    }, 70);
  };

  const currentColor = chosen
    ? (isBuff ? '#39ff14' : '#ff2d78')
    : spinning
      ? NEONS[colorIdx]
      : '#bf5fff';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.88)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="animate-bounce-in" style={{
        width: '100%', maxWidth: 380, margin: '0 16px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Spinning decorative ring */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420, height: 420,
          borderRadius: '50%',
          border: `3px dashed ${currentColor}44`,
          pointerEvents: 'none',
          transition: 'border-color 0.1s',
        }} className="animate-spin-slow" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 460, height: 460,
          borderRadius: '50%',
          border: `2px dashed ${currentColor}22`,
          pointerEvents: 'none',
        }} className="animate-spin-rev" />

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.6rem', letterSpacing: '0.15em',
            color: 'rgba(200,190,255,0.5)',
            marginBottom: 8,
          }}>
            🎰 IT&apos;S SPIN TIME
          </div>
          <div style={{
            fontFamily: '"Permanent Marker", cursive',
            fontSize: '2.2rem',
            color: spinningFor === 'w' ? '#ffee00' : '#00f5ff',
            filter: `drop-shadow(0 0 15px ${spinningFor === 'w' ? '#ffee00' : '#00f5ff'}88)`,
          }}>
            {playerLabel}
          </div>
        </div>

        {/* Effect display box */}
        <div
          onClick={!spinning && !chosen ? spin : undefined}
          style={{
            padding: '32px 24px',
            borderRadius: 20,
            border: `3px solid ${currentColor}`,
            background: `${currentColor}10`,
            cursor: !spinning && !chosen ? 'pointer' : 'default',
            marginBottom: 20,
            boxShadow: `0 0 40px ${currentColor}44, inset 0 0 40px ${currentColor}08`,
            transition: 'all 0.15s',
            minHeight: 140,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Spinning slot machine stripes when spinning */}
          {spinning && (
            <div style={{
              position: 'absolute', inset: 0, overflow: 'hidden',
              opacity: 0.07, pointerEvents: 'none',
            }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 0, right: 0,
                  height: '12.5%', top: `${i * 12.5}%`,
                  background: i % 2 === 0 ? '#fff' : 'transparent',
                }} />
              ))}
            </div>
          )}

          {effectDef ? (
            <>
              <div style={{
                fontFamily: '"Permanent Marker", cursive',
                fontSize: '1.8rem',
                color: currentColor,
                filter: `drop-shadow(0 0 10px ${currentColor})`,
                marginBottom: 6,
                transition: spinning ? 'none' : 'all 0.2s',
              }}>
                {effectDef.label}
              </div>
              <div style={{
                fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem',
                letterSpacing: '0.1em',
                color: isBuff ? '#39ff14' : '#ff2d78',
                marginBottom: chosen ? 12 : 0,
              }}>
                {isBuff ? '⬆ BUFF' : '⬇ NERF'}
              </div>
              {chosen && (
                <div style={{
                  fontFamily: '"Boogaloo", sans-serif', fontSize: '0.95rem',
                  color: 'rgba(200,190,255,0.7)', lineHeight: 1.5,
                  marginTop: 8,
                }} className="animate-slide-up">
                  {effectDef.description}
                </div>
              )}
            </>
          ) : (
            <div style={{
              fontFamily: '"Permanent Marker", cursive', fontSize: '1.4rem',
              color: 'rgba(200,190,255,0.4)',
            }}>
              Ready...
            </div>
          )}
        </div>

        {/* Buttons */}
        {!chosen ? (
          <button
            onClick={spin}
            disabled={spinning}
            style={{
              width: '100%', padding: '18px 0',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '2rem', letterSpacing: '0.06em',
              background: spinning
                ? 'rgba(200,190,255,0.1)'
                : `linear-gradient(135deg, #ff2d78, #ff9900, #ffee00)`,
              color: spinning ? 'rgba(200,190,255,0.5)' : '#fff',
              border: spinning ? '2px solid rgba(200,190,255,0.2)' : 'none',
              borderRadius: 18,
              cursor: spinning ? 'not-allowed' : 'pointer',
              boxShadow: spinning ? 'none' : '0 0 30px rgba(255,45,120,0.5), 0 8px 24px rgba(0,0,0,0.4)',
              animation: spinning ? 'none' : `wiggle-btn ${spinCount > 0 ? '0s' : '2s'} ease-in-out ${spinCount > 0 ? '' : 'infinite'}`,
              transition: 'all 0.15s',
            }}
          >
            {spinning ? '🌀 Spinning...' : '🎰 SPIN!'}
          </button>
        ) : (
          <button
            onClick={() => onEffect(chosen)}
            style={{
              width: '100%', padding: '18px 0',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '1.6rem', letterSpacing: '0.04em',
              background: isBuff
                ? 'linear-gradient(135deg, #39ff14, #00d4aa)'
                : 'linear-gradient(135deg, #ff2d78, #ff6b00)',
              color: '#fff', border: 'none', borderRadius: 18,
              cursor: 'pointer',
              boxShadow: `0 0 30px ${isBuff ? 'rgba(57,255,20,0.4)' : 'rgba(255,45,120,0.4)'}, 0 8px 24px rgba(0,0,0,0.4)`,
              animation: 'bob 1s ease-in-out infinite',
            }}
          >
            {isBuff ? '✨' : '💥'} Apply: {effectDef?.label}!
          </button>
        )}
      </div>
    </div>
  );
}
