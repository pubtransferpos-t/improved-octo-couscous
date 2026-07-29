/**
 * Gambit – Custom Online Lobby
 * Create / join / spectate custom game rooms.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { GameSettings, DEFAULT_SETTINGS } from '@/hooks/use-gambit';
import { EffectType } from '@/hooks/gambit-engine';
import { getGameSettings } from './home';
import { getSavedGames, saveGame, removeSavedGame, daysUntilExpiry, SavedGame } from '@/lib/saved-games';

/* ─── Worker proxy base ───────────────────────────────────────────────────── */
const WORKER_PROXY = '/api/worker-proxy';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
type GameMode = 'standard' | 'chess960' | 'duck_chess' | 'bughouse' | 'four_player' | 'live_action' | 'chess_checkers';

interface LobbyRoom {
  roomId: string;
  gameMode: GameMode | string;
  status: 'waiting' | 'playing';
  createdAt: number;
  spectatorCount: number;
  spinInterval?: number;
  title?: string;
  description?: string;
}

interface ModeInfo { id: GameMode; label: string; emoji: string; desc: string }

const AVAILABLE_MODES: ModeInfo[] = [
  { id: 'standard',      label: 'Standard',          emoji: '♟',  desc: 'Classic Gambit rules' },
  { id: 'chess960',      label: 'Chess960',           emoji: '🎲', desc: 'Randomised back rank' },
  { id: 'duck_chess',    label: 'Duck Chess',         emoji: '🦆', desc: 'Place a blocking duck after every move' },
  { id: 'bughouse',      label: 'Bughouse',           emoji: '🐛', desc: 'Captured pieces pass to your partner' },
  { id: 'four_player',   label: 'Four-Player',        emoji: '4️⃣', desc: 'Four armies on one board' },
  { id: 'live_action',   label: 'Live Action',        emoji: '⚡', desc: 'Real-time — no turn waiting' },
  { id: 'chess_checkers',label: 'Chess vs Checkers',  emoji: '🔴', desc: 'One side plays checkers rules' },
];

function gameModeLabel(mode: string) {
  const found = AVAILABLE_MODES.find(m => m.id === mode);
  return found ? `${found.emoji} ${found.label}` : mode;
}

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
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDescription, setMatchDescription] = useState('');
  const [gameMode, setGameMode] = useState<string>('standard');
  const [spinInterval, setSpinInterval] = useState(5);
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  useEffect(() => { setSavedGames(getSavedGames()); }, []);

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
      const title = matchTitle.trim().slice(0, 60);
      const description = matchDescription.trim().slice(0, 200);
      const initialFen = gameMode === 'chess960' ? generateChess960Fen() : undefined;
      const url = new URL(`${WORKER_PROXY}/rooms`);
      url.searchParams.set('roomId', roomId);
      url.searchParams.set('gameMode', gameMode);
      url.searchParams.set('spinInterval', String(spinInterval));
      url.searchParams.set('isPublic', String(isPublicRoom));
      if (title) url.searchParams.set('title', title);
      if (description) url.searchParams.set('description', description);
      if (initialFen) url.searchParams.set('initialFen', initialFen);

      const r = await fetch(url.toString(), { method: 'POST' });
      if (!r.ok) throw new Error('Could not create room');

      // Register in public lobby
      if (isPublicRoom) {
        await fetch(`${WORKER_PROXY}/lobby/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, gameMode, spinInterval, title, description }),
        }).catch(() => {});
      }

      saveGame({ roomId, title: title || undefined, description: description || undefined, gameMode, role: 'host' });

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
      const room = await r.json() as {
        status: string;
        guestJoined: boolean;
        spinEligibility?: { white: number; black: number };
        enabledEffects?: string[];
        title?: string;
        description?: string;
        gameMode?: string;
      };
      if (room.guestJoined && room.status === 'playing') {
        throw new Error('Room is full — spectate instead');
      }
      saveGame({ roomId: code, title: room.title, description: room.description, gameMode: room.gameMode, role: 'guest' });
      const baseSettings = getGameSettingsSafe();
      // Derive spin interval from room state if available
      const roomSpinInterval = room.spinEligibility?.white ?? baseSettings.spinInterval;
      // Apply the host's custom effect pool so both players use the same modifiers
      const roomEffects = (room.enabledEffects && room.enabledEffects.length > 0)
        ? room.enabledEffects as EffectType[]
        : baseSettings.enabledEffects;
      const newSettings: GameSettings = {
        ...baseSettings,
        mode: 'online',
        spinInterval: roomSpinInterval,
        enabledEffects: roomEffects,
        playerColor: 'b',
        customRoomId: code,
        customRoomColor: 'b',
        spectate: false,
      };
      saveSettingsAndNavigate(newSettings);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join');
    }
    setJoining(false);
  };

  // ── Spectate ─────────────────────────────────────────────────────────────
  const handleSpectate = async (roomId: string) => {
    try {
      const r = await fetch(`${WORKER_PROXY}/rooms/${roomId}/state`);
      if (r.ok) {
        const room = await r.json() as { title?: string; description?: string; gameMode?: string };
        saveGame({ roomId, title: room.title, description: room.description, gameMode: room.gameMode, role: 'spectator' });
      }
    } catch { /* still let them spectate even if the save-game lookup fails */ }
    const baseSettings = getGameSettingsSafe();
    const newSettings: GameSettings = {
      ...baseSettings, mode: 'online',
      customRoomId: roomId, spectate: true,
    };
    saveSettingsAndNavigate(newSettings);
  };

  // ── Resume a saved game ────────────────────────────────────────────────
  const handleResume = (entry: SavedGame) => {
    const baseSettings = getGameSettingsSafe();
    const newSettings: GameSettings = {
      ...baseSettings, mode: 'online',
      customRoomId: entry.roomId,
      spectate: entry.role === 'spectator',
      playerColor: entry.role === 'guest' ? 'b' : 'w',
      ...(entry.role === 'guest' ? { customRoomColor: 'b' as const } : {}),
    };
    saveSettingsAndNavigate(newSettings);
  };

  const handleForgetSaved = (roomId: string) => {
    removeSavedGame(roomId);
    setSavedGames(getSavedGames());
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
              onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 16))}
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
              {/* Match title / description */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', color: 'rgba(200,190,255,0.6)', fontSize: '0.85rem' }}>Match title (optional)</p>
                <input
                  value={matchTitle}
                  onChange={e => setMatchTitle(e.target.value.slice(0, 60))}
                  placeholder="e.g. Friday Night Blitz"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(191,95,255,0.3)',
                    borderRadius: 10, padding: '9px 12px', color: '#f0f0ff',
                    fontFamily: '"Boogaloo", sans-serif', fontSize: '1rem', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', color: 'rgba(200,190,255,0.6)', fontSize: '0.85rem' }}>Description (optional)</p>
                <textarea
                  value={matchDescription}
                  onChange={e => setMatchDescription(e.target.value.slice(0, 200))}
                  placeholder="Anything else players should know…"
                  rows={2}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(191,95,255,0.3)',
                    borderRadius: 10, padding: '9px 12px', color: '#f0f0ff',
                    fontFamily: '"Boogaloo", sans-serif', fontSize: '0.95rem', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Game mode selector */}
              <p style={{ margin: '0 0 8px', color: 'rgba(200,190,255,0.6)', fontSize: '0.85rem' }}>Game mode</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                {AVAILABLE_MODES.map(m => {
                  const active = gameMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setGameMode(m.id)}
                      style={{
                        padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        fontFamily: '"Boogaloo", sans-serif',
                        background: active ? 'rgba(191,95,255,0.18)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? '#bf5fff' : 'rgba(255,255,255,0.08)'}`,
                        color: active ? '#bf5fff' : 'rgba(200,190,255,0.7)',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{m.emoji}</span>
                      <span>
                        <span style={{ fontSize: '0.95rem', fontWeight: active ? 700 : 400 }}>{m.label}</span>
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'rgba(200,190,255,0.4)' }}>{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
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

        {/* Saved games */}
        {savedGames.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontFamily: '"Permanent Marker", cursive', fontSize: '1.2rem', margin: '0 0 12px', color: 'rgba(200,190,255,0.8)' }}>
              Saved Games
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {savedGames.map(entry => (
                <div key={entry.roomId} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem',
                        color: entry.role === 'host' ? '#39ff14' : entry.role === 'guest' ? '#00f5ff' : '#bf5fff',
                        letterSpacing: '0.06em',
                      }}>
                        {entry.role === 'host' ? '♔ HOST' : entry.role === 'guest' ? '♚ GUEST' : '👁 SPECTATOR'}
                      </span>
                      <span style={{
                        fontFamily: '"Press Start 2P", monospace', fontSize: '0.4rem',
                        color: 'rgba(200,190,255,0.35)',
                      }}>
                        {daysUntilExpiry(entry)}d left
                      </span>
                    </div>
                    <div style={{
                      marginTop: 4, color: '#f0f0ff', fontSize: '0.95rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {entry.title || entry.roomId}
                    </div>
                    {entry.description && (
                      <div style={{
                        marginTop: 2, color: 'rgba(200,190,255,0.5)', fontSize: '0.78rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleResume(entry)}
                      style={{
                        background: 'rgba(191,95,255,0.15)', border: '1px solid rgba(191,95,255,0.4)',
                        borderRadius: 8, cursor: 'pointer', color: '#bf5fff',
                        fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem', padding: '6px 12px',
                      }}
                    >Resume</button>
                    <button
                      onClick={() => handleForgetSaved(entry.roomId)}
                      title="Remove from saved games"
                      style={{
                        background: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.3)',
                        borderRadius: 8, cursor: 'pointer', color: '#ff2d78',
                        fontFamily: '"Boogaloo", sans-serif', fontSize: '0.85rem', padding: '6px 10px',
                      }}
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    {room.title ? (
                      <strong style={{ color: '#f0f0ff' }}>{room.title}</strong>
                    ) : (
                      gameModeLabel(room.gameMode)
                    )}
                    {room.spinInterval != null && (
                      <span style={{ marginLeft: 8, color: '#ff9900', fontSize: '0.75rem' }}>
                        🎲 /{room.spinInterval}
                      </span>
                    )}
                    {room.spectatorCount > 0 && (
                      <span style={{ marginLeft: 8, color: 'rgba(200,190,255,0.4)', fontSize: '0.75rem' }}>
                        👁 {room.spectatorCount}
                      </span>
                    )}
                  </div>
                  {room.title && (
                    <div style={{ marginTop: 2, color: 'rgba(200,190,255,0.45)', fontSize: '0.75rem' }}>
                      {gameModeLabel(room.gameMode)}
                    </div>
                  )}
                  {room.description && (
                    <div style={{ marginTop: 3, color: 'rgba(200,190,255,0.5)', fontSize: '0.8rem', maxWidth: 320 }}>
                      {room.description}
                    </div>
                  )}
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
  // 16 random letters + digits — a unique identifier for custom matches.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
