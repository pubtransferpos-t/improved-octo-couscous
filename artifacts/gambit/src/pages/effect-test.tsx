/**
 * Effect Test Mode — secret developer page
 * Access: press "2" five times on the home screen
 *
 * Cycles through every buff/nerf one-at-a-time. For each effect:
 *   1. Shows the board in the starting position
 *   2. Lets the tester force-apply the effect (as White)
 *   3. Tester interacts with the board to verify
 *   4. Marks "✓ Working" or "✗ Failed"
 *   5. Moves to the next effect (board resets automatically)
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { EFFECTS, EffectType, RARITY_CONFIG } from '@/hooks/gambit-engine';
import GameTestBed from '@/components/effect-test-bed';

/* ── All effect types in a stable order ──────────────────────────────────── */
const ALL_EFFECTS = Object.keys(EFFECTS) as EffectType[];

/* ── Result record ────────────────────────────────────────────────────────── */
type TestResult = 'working' | 'failed' | 'skipped';
interface EffectResult { type: EffectType; result: TestResult }

export default function EffectTest() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<EffectResult[]>([]);
  const [done, setDone] = useState(false);
  const [gameKey, setGameKey] = useState(0); // bump → GameTestBed remounts → fresh board

  const currentEffect = ALL_EFFECTS[index];
  const currentDef = EFFECTS[currentEffect];
  const rarityConfig = RARITY_CONFIG[currentDef.rarity];

  const recordResult = (result: TestResult) => {
    const newResults = [...results, { type: currentEffect, result }];
    setResults(newResults);
    if (index + 1 >= ALL_EFFECTS.length) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
      setGameKey(k => k + 1); // remount GameTestBed → fresh chess instance + state
    }
  };

  const goBack = () => {
    if (done) {
      // Coming back from the summary screen — re-enter the last effect
      setDone(false);
      setIndex(ALL_EFFECTS.length - 1);
      setResults(r => r.slice(0, -1));
      setGameKey(k => k + 1);
    } else if (index > 0) {
      setIndex(i => i - 1);
      setResults(r => r.slice(0, -1));
      setGameKey(k => k + 1);
    }
  };

  const canGoBack = done || index > 0;

  const copyReport = () => {
    const lines = [
      '=== Gambit Effect Test Report ===',
      `Date: ${new Date().toISOString()}`,
      `Tested: ${results.length} / ${ALL_EFFECTS.length} effects`,
      '',
      '✓ Working:',
      ...results.filter(r => r.result === 'working').map(r => `  • ${EFFECTS[r.type].emoji} ${EFFECTS[r.type].label} (${r.type})`),
      '',
      '✗ Failed:',
      ...results.filter(r => r.result === 'failed').map(r => `  • ${EFFECTS[r.type].emoji} ${EFFECTS[r.type].label} (${r.type})`),
      '',
      '— Skipped:',
      ...results.filter(r => r.result === 'skipped').map(r => `  • ${EFFECTS[r.type].emoji} ${EFFECTS[r.type].label} (${r.type})`),
    ].join('\n');
    void navigator.clipboard.writeText(lines);
  };

  /* ── Summary screen ──────────────────────────────────────────────────────── */
  if (done) {
    const working = results.filter(r => r.result === 'working');
    const failed = results.filter(r => r.result === 'failed');
    const skipped = results.filter(r => r.result === 'skipped');
    return (
      <div style={{ minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff', padding: '40px 24px', fontFamily: '"Boogaloo", sans-serif' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 style={{ fontFamily: '"Permanent Marker", cursive', fontSize: '2.4rem', background: 'linear-gradient(135deg,#ff2d78,#ff9900,#ffee00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 8 }}>
            Test Complete!
          </h1>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <Pill color="#39ff14">{working.length} Working</Pill>
            <Pill color="#ff2d78">{failed.length} Failed</Pill>
            <Pill color="#bf5fff">{skipped.length} Skipped</Pill>
          </div>

          {failed.length > 0 && (
            <Section label="✗ Failed" color="#ff2d78">
              {failed.map(r => <EffectRow key={r.type} type={r.type} color="#ff2d78" />)}
            </Section>
          )}
          {working.length > 0 && (
            <Section label="✓ Working" color="#39ff14">
              {working.map(r => <EffectRow key={r.type} type={r.type} color="#39ff14" />)}
            </Section>
          )}
          {skipped.length > 0 && (
            <Section label="— Skipped" color="#bf5fff">
              {skipped.map(r => <EffectRow key={r.type} type={r.type} color="#bf5fff" />)}
            </Section>
          )}

          {/* Plain-text results log */}
          <div style={{ marginTop: 28, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem', color: 'rgba(200,190,255,0.5)', letterSpacing: '0.1em', marginBottom: 10 }}>PLAIN TEXT RESULTS</div>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.7, color: 'rgba(220,215,255,0.85)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {results.map(r => {
                const def = EFFECTS[r.type];
                const statusIcon = r.result === 'working' ? '✓' : r.result === 'failed' ? '✗' : '–';
                return `${statusIcon} ${def.label} (${r.type}) — ${r.result.toUpperCase()}`;
              }).join('\n')}
            </pre>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={copyReport} style={actionBtn('#00f5ff')}>📋 Copy Report</button>
            <button onClick={goBack} style={actionBtn('#00f5ff')}>← Re-test Last</button>
            <button onClick={() => setLocation('/')} style={actionBtn('#ff2d78')}>← Back to Menu</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Per-effect test screen ──────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: '#0d0a1a', color: '#f0f0ff', fontFamily: '"Boogaloo", sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 50, borderBottom: '1px solid rgba(191,95,255,0.2)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', flexShrink: 0 }}>
        <button onClick={() => setLocation('/')} style={{ background: 'rgba(255,45,120,0.15)', border: '1px solid rgba(255,45,120,0.4)', borderRadius: 8, cursor: 'pointer', fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', color: '#ff2d78', padding: '4px 12px' }}>
          ← Exit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={goBack}
            disabled={!canGoBack}
            style={{ background: canGoBack ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canGoBack ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, cursor: canGoBack ? 'pointer' : 'default', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: canGoBack ? '#00f5ff' : 'rgba(255,255,255,0.2)', padding: '4px 12px', transition: 'all 0.15s' }}
          >
            ← Prev
          </button>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem', color: 'rgba(200,190,255,0.5)', letterSpacing: '0.08em' }}>
            EFFECT TEST MODE · {index + 1} / {ALL_EFFECTS.length}
          </span>
        </div>
        <button onClick={() => recordResult('skipped')} style={{ background: 'rgba(191,95,255,0.15)', border: '1px solid rgba(191,95,255,0.4)', borderRadius: 8, cursor: 'pointer', fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: '#bf5fff', padding: '4px 12px' }}>
          Skip →
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${((index) / ALL_EFFECTS.length) * 100}%`, background: 'linear-gradient(90deg,#ff2d78,#ff9900,#ffee00)', transition: 'width 0.3s' }} />
      </div>

      {/* Effect info card */}
      <div style={{ padding: '12px 16px', flexShrink: 0, maxWidth: 640, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: `2px solid ${rarityConfig.color}55`, borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.6rem' }}>{currentDef.emoji}</span>
            <div>
              <div style={{ fontFamily: '"Permanent Marker", cursive', fontSize: '1.2rem', color: rarityConfig.color, filter: `drop-shadow(0 0 6px ${rarityConfig.glow})` }}>
                {currentDef.label}
              </div>
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.36rem', color: rarityConfig.color, opacity: 0.7, letterSpacing: '0.08em' }}>
                {rarityConfig.label} · {currentDef.category.toUpperCase()} · {currentDef.duration === 0 ? 'INSTANT' : `${currentDef.duration} TURNS`} · target: {currentDef.targetRule}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'rgba(200,190,255,0.7)', margin: 0 }}>{currentDef.description}</p>
        </div>
      </div>

      {/* Game bed (remounts on gameKey change, giving a fresh board + state) */}
      <GameTestBed
        key={gameKey}
        effectType={currentEffect}
        onWorking={() => recordResult('working')}
        onFailed={() => recordResult('failed')}
      />
    </div>
  );
}

/* ── Mini components ─────────────────────────────────────────────────────── */

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 16px', borderRadius: 20, background: `${color}22`, border: `1px solid ${color}66`, color, fontFamily: '"Boogaloo", sans-serif', fontSize: '1.05rem' }}>
      {children}
    </div>
  );
}

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.42rem', color, letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function EffectRow({ type, color }: { type: EffectType; color: string }) {
  const def = EFFECTS[type];
  return (
    <div style={{ padding: '5px 12px', borderRadius: 8, background: `${color}10`, border: `1px solid ${color}30`, fontSize: '0.9rem', color }}>
      {def.emoji} {def.label} <span style={{ opacity: 0.5 }}>({type})</span>
    </div>
  );
}

function actionBtn(color: string): React.CSSProperties {
  return {
    padding: '10px 24px', borderRadius: 10, fontSize: '1rem',
    fontFamily: '"Boogaloo", sans-serif', cursor: 'pointer',
    background: `${color}20`, border: `1.5px solid ${color}80`,
    color, transition: 'all 0.15s',
  };
}
