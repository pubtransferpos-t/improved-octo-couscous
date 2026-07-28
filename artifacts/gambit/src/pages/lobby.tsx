/**
 * Gambit – Custom Online Lobby
 * Create / join / spectate custom game rooms.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EffectType } from '@/hooks/gambit-engine';
import { getGameSettings } from './home';

/* ─── Worker proxy base ───────────────────────────────────────────────────── */
const WORKER_PROXY = '/api/worker-proxy';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
type GameMode = 'standard' | 'chess960';

interface LobbyRoom {
  roomId: string;
  gameMode: GameMode | string;
  status: 'waiting' | 'playing';
  createdAt: number;
  spectatorCount: number;
}

function gameModeLabel(mode: string) {
  const map: Record<string, string> = {
    standard: 'Standard', chess960: 'Chess960',
    duck_chess: '🦆 Duck Chess (soon)', bughouse: 'Bughouse (soon)',
    four_player: 'Four-Player (soon)', live_action: 'Live Action (soon)',
    chess_checkers: 'Chess vs Checkers (soon)',
  };
  return map[mode] ?? mode;
}

const AVAILABLE_MODES: { id: GameMode | string; label: string; available: boolean }[] = [
  { id: 'standard', label: 'Standard', available: true },
  { id: 'chess960', label: 'Chess960', available: true },
  { id: 'duck_chess', label: '🦆 Duck Chess', available: false },
  { id: 'bughouse', label: 'Bughouse', available: false },
  { id: 'four_player', label: 'Four-Player', available: false },
  { id: 'live_action', label: 'Live Action', available: false },
  { id: 'chess_checkers', label: 'Chess vs Checkers', available: false },
];

/** Generate a valid Chess960 starting FEN */
function generateChess960Fen(): string {
  // Place pieces on back rank according to Chess960 rules
  const rank = Array(8).fill('');

  // 1. Place bishops on opposite colors
  const lightBishopFiles = [0, 2, 4, 6];
  const darkBishopFiles = [1, 3, 5, 7];
  const b1 = lightBishopFiles[Math.floor(Math.random() * 4)];
  const b2 = darkBishopFiles[Math.floor(Math.random() * 4)];
  rank[b1] = 'B'; rank[b2] = 'B';

  // 2. Place queen on any empty square
  const empty1 = rank.map((v, i) => !v ? i : -1).filter(i => i >= 0);
  const qFile = empty1[Math.floor(Math.random() * empty1.length)];
  rank[qFile] = 'Q';

  // 3. Place knights on 2 of remaining 5 empty squares
  const empty2 = rank.map((v, i) => !v ? i : -1).filter(i => i >= 0);
  const n1Idx = Math.floor(Math.random() * empty2.length);
  rank[empty2[n1Idx]] = 'N';
  const empty3 = rank.map((v, i) => !v ? i : -1).filter(i => i >= 0);
  const n2Idx = Math.floor(Math.random() * empty3.length);
  rank[empty3[n2Idx]] = 'N';

  // 4. Remaining 3 squares: R K R in that order
  const remaining = rank.map((v, i) => !v ? i : -1).filter(i => i >= 0).sort((a, b) => a - b);
  rank[remaining[0]] = 'R';
  rank[remaining[1]] = 'K';
  rank[remaining[2]] = 'R';

  const whiteBack = rank.join('').toLowerCase();
  const blackBack = rank.join('');
  return `${blackBack}/pppppppp/8/8/8/8/PPPPPPPP/${whiteBack} w KQkq - 0 1`;
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function Lobby() {
  const [, setLocation] = useLocation();

  // ── State ────────────────────────────────────────────────────────────────
  const [publicRooms, setPublicRooms] = useState<LobbyRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [createMode, setCreateMode] = useState(false);
  const [gameMode, setGameMode] = useState<string>('standard');
  const [spinInterval, setSpinInterval] = useState(5);
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // ── Load public rooms ─────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    try {
      const r = await fetch(`${WORKER_PROXY}/lobby/rooms`);
      if (!r.ok) throw new Error('Failed to load rooms');
      const data = await r.json() as { rooms: LobbyRoom[] };
      setPublicRooms(data.rooms ?? []);
    } catch { /* ignore */ }
    setLoadingRooms(false);
  }, []);

  useEffect(() => {
    void fetchRooms();
    const interval = setInterval(fetchRooms, 8000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  // ── Create room ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const roomId = generateRoomId();
      const initialFen = gameMode === 'chess960' ? generateChess960Fen() : undefined;
      const url = new URL(`${WORKER_PROXY}/rooms`);
      url.searchParams.set('roomId', roomId);
      url.searchParams.set('gameMode', gameMode);
      url.searchParams.set('spinInterval', String(spinInterval));
      url.searchParams.set('isPublic', String(isPublicRoom));
      if (initialFen) url.searchParams.set('initialFen', initialFen);

      const r = await fetch(url.toString(), { method: 'POST' });
      if (!r.ok) throw new Error('Could not create room');

      // Register in public lobby
      if (isPublicRoom) {
        await fetch(`${WORKER_PROXY}/lobby/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, gameMode }),
        }).catch(() => {});
      }

      // Navigate to game as host (white)
      const baseSettings = getGameSettingsSafe();
      const newSettings: GameSettings = {
        ...baseSettings, mode: 'online', spinInterval,
        playerColor: 'w', customRoomId: roomId, spectate: false,
      };
      saveSettingsAndNavigate(newSettings);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create room');
    }
    setCreating(false);
  };

  // ── Join room ───────────────────────────────────────────────────────────
  const handleJoin = async (roomId?: string) => {
    const code = (roomId ?? joinCode).trim().toUpperCase();
    if (!code || code.length < 4) { setJoinError('Enter a valid room code'); return; }
    setJoining(true);
    setJoinError('');
    try {
      const r = await fetch(`${WORKER_PROXY}/rooms/${code}/state`);
      if (!r.ok) throw new Error('Room not found');
      const room = await r.json() as { status: string; guestJoined: boolean };
      if (room.guestJoined && room.status === 'playing') {
        throw new Error('Room is full — spectate instead');
      }
      const baseSettings = getGameSettingsSafe();
      const newSettings: GameSettings = {
        ...baseSettings, mode: 'online', spinInterval: baseSettings.spinInterval,
        playerColor: 'b', customRoomId: code, customRoomColor: 'b', spectate: false,
      };
      saveSettingsAndNavigate(newSettings);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join');
    }
    setJoining(false);
  };

  // ── Spectate ─────────────────────────────────────────────────────────────
  const handleSpectate = (roomId: string) => {
    const baseSettings = getGameSettingsSafe();
    const newSettings: GameSettings = {
      ...baseSettings, mode: 'online',
      customRoomId: roomId, spectate: true,
    };
    saveSettingsAndNavigate(newSettings);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh', background: '#0d0a1a', color: '#f0f0ff',
      fontFamily: '"Boogaloo", sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Rainbow bar */}
      <div style={{
        height: 5, flexShrink: 0,
        background: 'linear-gradient(90deg, #ff2d78, #ff9900, #ffee00, #39ff14, #00f5ff, #bf5fff, #ff2d78)',
        backgroundSize: '200% 100%', animation: 'rainbow 3s linear infinite',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderBottom: '1px solid rgba(191,95,255,0.2)',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
      }}>
        <button
          onClick={() => setLocation('/')}
          style={{
            background: 'rgba(255,45,120,0.15)', border: '1px solid rgba(255,45,120,0.4)',
            borderRadius: 8, cursor: 'pointer', color: '#ff2d78',
            fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', padding: '4px 12px',
          }}
        >← Back</button>
        <span style={{
          fontFamily: '"Permanent Marker", cursive', fontSize: '1.5rem',
          background: 'linear-gradient(135deg, #bf5fff, #00f5ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Custom Lobby</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px 16px', maxWidth: 540, margin: '0 auto', width: '100%' }}>

        {/* Quick-join bar */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: '16px', marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 10px', color: 'rgba(200,190,255,0.7)', fontSize: '0.95rem' }}>
            Have a room code?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="Room code…"
              style={{
                flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(191,95,255,0.3)',
                borderRadius: 10, padding: '10px 12px', color: '#f0f0ff',
                fontFamily: '"Boogaloo", sans-serif', fontSize: '1.1rem',
                outline: 'none', letterSpacing: '0.1em', textTransform: 'uppercase',
              }}
            />
            <button
              onClick={() => handleJoin()}
              disabled={joining}
              style={{
                background: 'linear-gradient(135deg, #bf5fff, #00f5ff)', color: '#0d0a1a',
                border: 'none', borderRadius: 10, cursor: 'pointer', padding: '10px 18px',
                fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', fontWeight: 700,
                opacity: joining ? 0.6 : 1,
              }}
            >
              {joining ? '…' : 'Join'}
            </button>
          </div>
          {joinError && <p style={{ color: '#ff2d78', margin: '6px 0 0', fontSize: '0.85rem' }}>{joinError}</p>}
        </div>

        {/* Create room */}
        <div style={{
          background: 'rgba(191,95,255,0.07)', border: '1px solid rgba(191,95,255,0.25)',
          borderRadius: 16, padding: '16px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: createMode ? 14 : 0 }}>
            <span style={{ fontSize: '1rem', color: 'rgba(200,190,255,0.8)' }}>✨ Create a Room</span>
            <button
              onClick={() => setCreateMode(v => !v)}
              style={{
                background: createMode ? 'rgba(191,95,255,0.25)' : 'rgba(191,95,255,0.12)',
                border: '1px solid rgba(191,95,255,0.4)', borderRadius: 8,
                cursor: 'pointer', color: '#bf5fff',
                fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', padding: '4px 12px',
              }}
            >
              {createMode ? 'Collapse ▲' : 'New ▼'}
            </button>
          </div>

          {createMode && (
            <>
              {/* Game mode selector */}
              <p style={{ margin: '0 0 8px', color: 'rgba(200,190,255,0.6)', fontSize: '0.85rem' }}>Game mode</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {AVAILABLE_MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => m.available && setGameMode(m.id)}
                    disabled={!m.available}
                    title={m.available ? undefined : 'Coming soon'}
                    style={{
                      padding: '5px 12px', borderRadius: 8, cursor: m.available ? 'pointer' : 'not-allowed',
                      fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem',
                      background: gameMode === m.id ? 'rgba(191,95,255,0.3)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${gameMode === m.id ? '#bf5fff' : 'rgba(255,255,255,0.12)'}`,
                      color: m.available ? (gameMode === m.id ? '#bf5fff' : 'rgba(200,190,255,0.7)') : 'rgba(200,190,255,0.3)',
                    }}
                  >
                    {m.label}{!m.available ? ' 🔒' : ''}
                  </button>
                ))}
              </div>

              {/* Spin interval */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', color: 'rgba(200,190,255,0.6)', fontSize: '0.85rem' }}>
                  Spin every <strong style={{ color: '#ff9900' }}>{spinInterval}</strong> moves
                </p>
                <input
                  type="range" min={3} max={10} value={spinInterval}
                  onChange={e => setSpinInterval(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#bf5fff' }}
                />
              </div>

              {/* Public / Private */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                color: 'rgba(200,190,255,0.7)', fontSize: '0.9rem', marginBottom: 14,
              }}>
                <input
                  type="checkbox" checked={isPublicRoom}
                  onChange={e => setIsPublicRoom(e.target.checked)}
                  style={{ accentColor: '#bf5fff', width: 16, height: 16 }}
                />
                List in public lobby
              </label>

              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 12,
                  background: 'linear-gradient(135deg, #bf5fff, #00f5ff)', color: '#0d0a1a',
                  border: 'none', cursor: 'pointer', fontFamily: '"Permanent Marker", cursive',
                  fontSize: '1.2rem', opacity: creating ? 0.6 : 1,
                  boxShadow: '0 0 20px rgba(191,95,255,0.3)',
                }}
              >
                {creating ? 'Creating…' : 'Create Room 🎲'}
              </button>
              {createError && <p style={{ color: '#ff2d78', margin: '8px 0 0', fontSize: '0.85rem' }}>{createError}</p>}
            </>
          )}
        </div>

        {/* Public rooms list */}
        <h3 style={{ fontFamily: '"Permanent Marker", cursive', fontSize: '1.2rem', margin: '0 0 12px', color: 'rgba(200,190,255,0.8)' }}>
          Public Rooms
        </h3>
        {loadingRooms ? (
          <p style={{ color: 'rgba(200,190,255,0.4)', textAlign: 'center', padding: '20px 0' }}>Loading…</p>
        ) : publicRooms.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '30px 0',
            color: 'rgba(200,190,255,0.35)', fontSize: '0.95rem',
          }}>
            No public rooms yet.<br />
            <span style={{ color: 'rgba(200,190,255,0.5)' }}>Create one above to get started!</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {publicRooms.map(room => (
              <div key={room.roomId} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${room.status === 'playing' ? 'rgba(0,245,255,0.2)' : 'rgba(57,255,20,0.2)'}`,
                borderRadius: 14, padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem',
                      color: room.status === 'playing' ? '#00f5ff' : '#39ff14',
                      letterSpacing: '0.06em',
                    }}>
                      {room.status === 'playing' ? '● IN PLAY' : '○ OPEN'}
                    </span>
                    <span style={{
                      fontFamily: '"Press Start 2P", monospace', fontSize: '0.42rem',
                      color: 'rgba(200,190,255,0.4)',
                    }}>
                      {room.roomId}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, color: 'rgba(200,190,255,0.7)', fontSize: '0.9rem' }}>
                    {gameModeLabel(room.gameMode)}
                    {room.spectatorCount > 0 && (
                      <span style={{ marginLeft: 8, color: 'rgba(200,190,255,0.4)', fontSize: '0.75rem' }}>
                        👁 {room.spectatorCount}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {room.status === 'waiting' && (
                    <button
                      onClick={() => handleJoin(room.roomId)}
                      style={{
                        background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.4)',
                        borderRadius: 8, cursor: 'pointer', color: '#39ff14',
                        fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem', padding: '6px 12px',
                      }}
                    >Join</button>
                  )}
                  <button
                    onClick={() => handleSpectate(room.roomId)}
                    style={{
                      background: 'rgba(191,95,255,0.1)', border: '1px solid rgba(191,95,255,0.3)',
                      borderRadius: 8, cursor: 'pointer', color: '#bf5fff',
                      fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem', padding: '6px 12px',
                    }}
                  >👁 Watch</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function getGameSettingsSafe(): GameSettings {
  try { return getGameSettings(); } catch { return DEFAULT_SETTINGS; }
}

function saveSettingsAndNavigate(settings: GameSettings) {
  // Write to the module-level store in home.tsx via the exported getter/setter pattern.
  // The cleanest way is to navigate with state embedded; we do this via the _settings variable.
  // home.tsx exports `getGameSettings()` which reads `_settings`; we reach it via
  // a custom event so we don't create a circular dep.
  const event = new CustomEvent('gambit:setSettings', { detail: settings });
  window.dispatchEvent(event);
  // Small delay so the handler in home.tsx can update before navigation
  setTimeout(() => {
    window.location.href = `${import.meta.env.BASE_URL}game`.replace('//', '/');
  }, 50);
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
