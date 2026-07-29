/**
 * Gambit – Saved custom/online games
 *
 * Persists a small pointer (roomId + display info) to any custom or online
 * match the player has created, joined, or spectated, so they can find their
 * way back to it later. Stored in a cookie (not localStorage) so the entry
 * naturally expires after 30 days without any cleanup code needing to run.
 */

const COOKIE_NAME = 'gambit_saved_games';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_ENTRIES = 25;

export type SavedGameRole = 'host' | 'guest' | 'spectator';

export interface SavedGame {
  roomId: string;
  title?: string;
  description?: string;
  gameMode?: string;
  role: SavedGameRole;
  /** Epoch ms when this entry was saved */
  savedAt: number;
}

/* ── cookie plumbing ──────────────────────────────────────────────────── */

function readCookieRaw(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return match.slice(COOKIE_NAME.length + 1);
}

function writeCookieRaw(value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/* ── public API ────────────────────────────────────────────────────────── */

/**
 * Returns all saved games, pruning anything older than 30 days.
 * Newest first.
 */
export function getSavedGames(): SavedGame[] {
  const raw = readCookieRaw();
  if (!raw) return [];

  let entries: SavedGame[];
  try {
    entries = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(entries)) return [];
  } catch {
    return [];
  }

  const cutoff = Date.now() - MAX_AGE_SECONDS * 1000;
  const fresh = entries.filter(e => typeof e?.savedAt === 'number' && e.savedAt >= cutoff);

  // Re-persist if pruning actually removed something, so the cookie doesn't
  // silently carry dead weight forever.
  if (fresh.length !== entries.length) {
    persist(fresh);
  }

  return fresh.sort((a, b) => b.savedAt - a.savedAt);
}

/** Adds or updates (by roomId) a saved game entry. */
export function saveGame(entry: Omit<SavedGame, 'savedAt'> & { savedAt?: number }): void {
  const existing = getSavedGames().filter(e => e.roomId !== entry.roomId);
  const next: SavedGame[] = [
    { ...entry, savedAt: entry.savedAt ?? Date.now() },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  persist(next);
}

/** Removes a saved game entry by roomId. */
export function removeSavedGame(roomId: string): void {
  const next = getSavedGames().filter(e => e.roomId !== roomId);
  persist(next);
}

function persist(entries: SavedGame[]): void {
  writeCookieRaw(encodeURIComponent(JSON.stringify(entries)));
}

/** Days remaining before a saved entry expires (for display). */
export function daysUntilExpiry(entry: SavedGame): number {
  const ageMs = Date.now() - entry.savedAt;
  const remainingMs = MAX_AGE_SECONDS * 1000 - ageMs;
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}
