/**
 * Admin / debug panel — only visible after unlocking with the secret key
 * or IP allowlist approval.
 * Access: press Shift+Alt+X while in a game, then enter the password.
 */

import { useState } from 'react';
import { Color } from 'chess.js';
import { EFFECTS, EffectType, RARITY_CONFIG, Rarity, GambitState } from '@/hooks/gambit-engine';

const TIER_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'broken', 'godly'];

interface AdminPanelProps {
  state: GambitState;
  currentTurn: Color;
  onForceEffect: (effect: EffectType, color: Color) => void;
  onForceSpin: (color: Color) => void;
  onLoadFen: (fen: string) => void;
  onSetSpinProgress: (color: Color, value: number) => void;
  onClearEffects: (color: Color) => void;
  onForceTurn: (color: Color) => void;
  onClose: () => void;
}

export default function AdminPanel({
  state, currentTurn, onForceEffect, onForceSpin, onLoadFen,
  onSetSpinProgress, onClearEffects, onForceTurn, onClose,
}: AdminPanelProps) {
  const [targetColor, setTargetColor] = useState<Color>('w');
  const [fenInput, setFenInput] = useState(state.fen);
  const [fenError, setFenError] = useState('');
  const [activeTab, setActiveTab] = useState<'effects' | 'state' | 'board'>('effects');
  const [spinInputW, setSpinInputW] = useState(String(state.spinProgress.w));
  const [spinInputB, setSpinInputB] = useState(String(state.spinProgress.b));

  const handleFenLoad = () => {
    if (!fenInput.trim()) return;
    setFenError('');
    try {
      const parts = fenInput.trim().split(' ');
      if (parts.length < 4) { setFenError('Invalid FEN format'); return; }
      onLoadFen(fenInput.trim());
      setFenError('');
    } catch {
      setFenError('Invalid FEN string');
    }
  };

  const panel: React.CSSProperties = {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: 340, zIndex: 200,
    background: 'rgba(8,4,24,0.97)',
    borderLeft: '2px solid rgba(255,45,120,0.5)',
    display: 'flex', flexDirection: 'column',
    fontFamily: '"Boogaloo", sans-serif',
    color: '#f0f0ff',
    backdropFilter: 'blur(12px)',
    overflowY: 'auto',
  };

  const tab: (active: boolean) => React.CSSProperties = (active) => ({
    flex: 1, padding: '8px 0',
    fontFamily: '"Press Start 2P", monospace', fontSize: '0.4rem',
    background: active ? 'rgba(255,45,120,0.2)' : 'transparent',
    color: active ? '#ff2d78' : 'rgba(200,190,255,0.5)',
    border: 'none', borderBottom: active ? '2px solid #ff2d78' : '2px solid transparent',
    cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.05em',
  });

  const btn: (color?: string) => React.CSSProperties = (color = '#ff2d78') => ({
    padding: '4px 10px', borderRadius: 6, border: `1px solid ${color}44`,
    background: `${color}15`, color, cursor: 'pointer', fontSize: '0.82rem',
    fontFamily: '"Boogaloo", sans-serif', transition: 'all 0.12s',
    whiteSpace: 'nowrap',
  });

  const colorBtn: (c: Color) => React.CSSProperties = (c) => ({
    padding: '4px 14px', borderRadius: 6,
    border: `2px solid ${c === 'w' ? '#ffee00' : '#00f5ff'}`,
    background: targetColor === c
      ? (c === 'w' ? 'rgba(255,238,0,0.2)' : 'rgba(0,245,255,0.2)')
      : 'transparent',
    color: c === 'w' ? '#ffee00' : '#00f5ff',
    cursor: 'pointer', fontSize: '0.88rem',
    fontFamily: '"Boogaloo", sans-serif', transition: 'all 0.12s',
  });

  const inputStyle: React.CSSProperties = {
    width: 52, padding: '3px 6px',
    fontFamily: 'monospace', fontSize: '0.82rem',
    background: 'rgba(0,0,0,0.4)', borderRadius: 4,
    border: '1px solid rgba(191,95,255,0.4)',
    color: '#f0f0ff',
  };

  const section = (label: string) => (
    <div style={{
      fontFamily: '"Press Start 2P", monospace', fontSize: '0.38rem',
      color: 'rgba(255,45,120,0.7)', letterSpacing: '0.1em',
      margin: '12px 0 6px', textTransform: 'uppercase',
    }}>{label}</div>
  );

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid rgba(255,45,120,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,45,120,0.08)', flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontFamily: '"Permanent Marker", cursive', fontSize: '1.1rem',
            color: '#ff2d78', filter: 'drop-shadow(0 0 8px rgba(255,45,120,0.5))',
          }}>🛠 Admin Panel</div>
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: '0.35rem',
            color: 'rgba(200,190,255,0.4)', marginTop: 2,
          }}>SHIFT+ALT+X to toggle</div>
        </div>
        <button onClick={onClose} style={{
          ...btn('#ff2d78'), padding: '6px 10px', fontSize: '1rem', borderRadius: '50%',
        }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <button style={tab(activeTab === 'effects')} onClick={() => setActiveTab('effects')}>EFFECTS</button>
        <button style={tab(activeTab === 'state')}   onClick={() => setActiveTab('state')}>STATE</button>
        <button style={tab(activeTab === 'board')}   onClick={() => setActiveTab('board')}>BOARD</button>
      </div>

      <div style={{ padding: '10px 14px', flex: 1, overflowY: 'auto' }}>

        {/* ── Effects tab ── */}
        {activeTab === 'effects' && (
          <>
            {section('Target Player')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button style={colorBtn('w')} onClick={() => setTargetColor('w')}>♔ White</button>
              <button style={colorBtn('b')} onClick={() => setTargetColor('b')}>♚ Black</button>
            </div>
            <div style={{
              fontFamily: '"Press Start 2P", monospace', fontSize: '0.35rem',
              color: 'rgba(200,190,255,0.4)', marginBottom: 10,
            }}>
              Effect applies as if {targetColor === 'w' ? 'White' : 'Black'} spun it.
            </div>

            {section('Force Spin')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={btn('#ffee00')} onClick={() => onForceSpin('w')}>🎰 White Spin</button>
              <button style={btn('#00f5ff')} onClick={() => onForceSpin('b')}>🎰 Black Spin</button>
            </div>

            {section('Force Effect')}
            {TIER_ORDER.map(rarity => {
              const effects = (Object.keys(EFFECTS) as EffectType[]).filter(e => EFFECTS[e].rarity === rarity);
              if (effects.length === 0) return null;
              const cfg = RARITY_CONFIG[rarity];
              return (
                <div key={rarity} style={{ marginBottom: 10 }}>
                  <div style={{
                    fontFamily: '"Press Start 2P", monospace', fontSize: '0.34rem',
                    color: cfg.color, letterSpacing: '0.1em', marginBottom: 4,
                    filter: `drop-shadow(0 0 4px ${cfg.glow})`,
                  }}>{cfg.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {effects.map(e => {
                      const def = EFFECTS[e];
                      const isNerf = def.category === 'nerf';
                      return (
                        <button
                          key={e}
                          onClick={() => onForceEffect(e, targetColor)}
                          title={def.description}
                          style={{
                            padding: '3px 7px', borderRadius: 6, fontSize: '0.78rem',
                            fontFamily: '"Boogaloo", sans-serif',
                            background: isNerf ? 'rgba(255,45,120,0.12)' : 'rgba(57,255,20,0.1)',
                            border: `1px solid ${isNerf ? 'rgba(255,45,120,0.35)' : 'rgba(57,255,20,0.3)'}`,
                            color: isNerf ? '#ff2d78' : '#39ff14',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}
                        >
                          {def.emoji} {def.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── State tab ── */}
        {activeTab === 'state' && (
          <>
            {section('Force Turn')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                style={{ ...btn('#ffee00'), opacity: currentTurn === 'w' ? 1 : 0.5 }}
                onClick={() => onForceTurn('w')}
              >♔ White's Turn</button>
              <button
                style={{ ...btn('#00f5ff'), opacity: currentTurn === 'b' ? 1 : 0.5 }}
                onClick={() => onForceTurn('b')}
              >♚ Black's Turn</button>
            </div>

            {section('Current Turn')}
            <div style={{ fontSize: '0.95rem', marginBottom: 8 }}>
              {state.turn === 'w' ? '♔ White' : '♚ Black'} to move
              {currentTurn !== state.turn && (
                <span style={{ color: '#ff2d78', marginLeft: 6 }}>(desync?)</span>
              )}
            </div>

            {section('Spin Progress')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#ffee00', fontSize: '0.88rem', width: 56 }}>♔ White</span>
                <input
                  type="number"
                  value={spinInputW}
                  onChange={e => setSpinInputW(e.target.value)}
                  style={inputStyle}
                  min={1} max={99}
                />
                <button style={btn('#ffee00')} onClick={() => {
                  const v = parseInt(spinInputW);
                  if (!isNaN(v) && v > 0) onSetSpinProgress('w', v);
                }}>Set</button>
                <button style={btn('#39ff14')} onClick={() => onForceSpin('w')}>Spin now</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#00f5ff', fontSize: '0.88rem', width: 56 }}>♚ Black</span>
                <input
                  type="number"
                  value={spinInputB}
                  onChange={e => setSpinInputB(e.target.value)}
                  style={inputStyle}
                  min={1} max={99}
                />
                <button style={btn('#00f5ff')} onClick={() => {
                  const v = parseInt(spinInputB);
                  if (!isNaN(v) && v > 0) onSetSpinProgress('b', v);
                }}>Set</button>
                <button style={btn('#39ff14')} onClick={() => onForceSpin('b')}>Spin now</button>
              </div>
            </div>

            {section('Active Effects')}
            {(['w', 'b'] as Color[]).map(c => {
              const effs = state.activeEffects[c];
              return (
                <div key={c} style={{ marginBottom: 8 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 3,
                  }}>
                    <div style={{
                      fontSize: '0.82rem', color: c === 'w' ? '#ffee00' : '#00f5ff',
                    }}>{c === 'w' ? '♔ White' : '♚ Black'}</div>
                    {effs.length > 0 && (
                      <button style={{ ...btn('#ff2d78'), fontSize: '0.72rem', padding: '2px 7px' }}
                        onClick={() => onClearEffects(c)}>
                        Clear all
                      </button>
                    )}
                  </div>
                  {effs.length === 0
                    ? <div style={{ fontSize: '0.78rem', color: 'rgba(200,190,255,0.3)' }}>none</div>
                    : effs.map(e => (
                      <div key={e.id} style={{
                        fontSize: '0.8rem', padding: '2px 6px', marginBottom: 2,
                        background: 'rgba(255,255,255,0.05)', borderRadius: 4,
                        color: EFFECTS[e.type]?.category === 'buff' ? '#39ff14' : '#ff2d78',
                      }}>
                        {EFFECTS[e.type]?.emoji} {EFFECTS[e.type]?.label} ×{e.duration}
                        {e.targetSquares.length > 0 && (
                          <span style={{ color: 'rgba(200,190,255,0.4)', marginLeft: 4 }}>
                            [{e.targetSquares.join(',')}]
                          </span>
                        )}
                      </div>
                    ))
                  }
                </div>
              );
            })}

            {section('Captured Pieces')}
            <div style={{ fontSize: '0.88rem', marginBottom: 8 }}>
              {state.capturedPieces.length === 0
                ? <span style={{ color: 'rgba(200,190,255,0.3)' }}>none</span>
                : state.capturedPieces.map((p, i) => (
                  <span key={i} style={{ color: p.color === 'w' ? '#ffee00' : '#00f5ff', marginRight: 3 }}>
                    {p.type.toUpperCase()}
                  </span>
                ))
              }
            </div>

            {section('Special State')}
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {state.royalReversal.w && <div style={{ color: '#ff2d78' }}>♔ White: Royal Reversal active</div>}
              {state.royalReversal.b && <div style={{ color: '#ff2d78' }}>♚ Black: Royal Reversal active</div>}
              {state.heir.w && <div style={{ color: '#fcd34d' }}>♔ White Heir: {state.heir.w}</div>}
              {state.heir.b && <div style={{ color: '#fcd34d' }}>♚ Black Heir: {state.heir.b}</div>}
              {state.illegalMoveAvailable.w && <div style={{ color: '#ff9900' }}>♔ White: Illegal move ready</div>}
              {state.illegalMoveAvailable.b && <div style={{ color: '#ff9900' }}>♚ Black: Illegal move ready</div>}
              {state.stockfishElo.w !== null && <div style={{ color: '#39ff14' }}>♔ Stockfish ELO: {state.stockfishElo.w}</div>}
              {state.stockfishElo.b !== null && <div style={{ color: '#39ff14' }}>♚ Stockfish ELO: {state.stockfishElo.b}</div>}
              {state.extraKings.w.length > 0 && <div style={{ color: '#c084fc' }}>♔ Extra Kings: {state.extraKings.w.join(', ')}</div>}
              {state.extraKings.b.length > 0 && <div style={{ color: '#c084fc' }}>♚ Extra Kings: {state.extraKings.b.join(', ')}</div>}
              {state.permanentBonusSpins.w > 0 && <div style={{ color: '#60a5fa' }}>♔ Permanent spins: +{state.permanentBonusSpins.w}</div>}
              {state.permanentBonusSpins.b > 0 && <div style={{ color: '#60a5fa' }}>♚ Permanent spins: +{state.permanentBonusSpins.b}</div>}
              {state.claimedSquares.w.length > 0 && <div style={{ color: '#f97316' }}>♔ Claimed: {state.claimedSquares.w.join(', ')}</div>}
              {state.claimedSquares.b.length > 0 && <div style={{ color: '#f97316' }}>♚ Claimed: {state.claimedSquares.b.join(', ')}</div>}
              {state.revoltedColor && <div style={{ color: '#a78bfa' }}>Revolted pawns: {state.revoltedColor === 'w' ? 'white→black' : 'black→white'}</div>}
              {state.rpsPending && <div style={{ color: '#fb7185' }}>RPS pending: {state.rpsPending}</div>}
            </div>

            {section('History Length')}
            <div style={{ fontSize: '0.88rem', marginBottom: 8 }}>{state.history.length} positions recorded</div>
          </>
        )}

        {/* ── Board tab ── */}
        {activeTab === 'board' && (
          <>
            {section('Current FEN')}
            <div style={{
              fontFamily: 'monospace', fontSize: '0.75rem',
              background: 'rgba(0,0,0,0.4)', borderRadius: 6,
              padding: '8px', marginBottom: 8, wordBreak: 'break-all',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(200,190,255,0.7)',
              userSelect: 'all',
            }}>
              {state.fen}
            </div>

            {section('Load Custom FEN')}
            <textarea
              value={fenInput}
              onChange={e => setFenInput(e.target.value)}
              rows={3}
              placeholder="Paste a FEN string…"
              style={{
                width: '100%', padding: '8px',
                fontFamily: 'monospace', fontSize: '0.75rem',
                background: 'rgba(0,0,0,0.4)', borderRadius: 6,
                border: '1px solid rgba(191,95,255,0.4)',
                color: '#f0f0ff', resize: 'vertical', marginBottom: 6,
                boxSizing: 'border-box',
              }}
            />
            {fenError && (
              <div style={{ color: '#ff2d78', fontSize: '0.82rem', marginBottom: 6 }}>{fenError}</div>
            )}
            <button onClick={handleFenLoad} style={{
              ...btn('#bf5fff'), padding: '8px 0', width: '100%', fontSize: '0.92rem',
              borderRadius: 8,
            }}>
              ♜ Load FEN
            </button>

            {section('Quick Positions')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: 'Starting position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
                { label: 'Endgame (KQ vs K)', fen: '8/8/8/8/4k3/8/8/3QK3 w - - 0 1' },
                { label: 'Both promoted', fen: 'QQQQQQQQ/8/8/8/8/8/8/qqqqqqqq w - - 0 1' },
                { label: 'White advantage', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1' },
              ].map(pos => (
                <button key={pos.fen} onClick={() => { setFenInput(pos.fen); onLoadFen(pos.fen); }}
                  style={{
                    ...btn('#39ff14'), padding: '5px 10px', textAlign: 'left', borderRadius: 6, fontSize: '0.82rem',
                  }}>
                  {pos.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
