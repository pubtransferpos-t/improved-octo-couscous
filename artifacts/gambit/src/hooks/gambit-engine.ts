import { Chess, Square, PieceSymbol, Color } from 'chess.js';

// ── Rarity tiers ──────────────────────────────────────────────────────────────

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'broken' | 'godly';

export const RARITY_CONFIG: Record<Rarity, { weight: number; label: string; color: string; glow: string }> = {
  common:    { weight: 50, label: 'COMMON',    color: '#9ca3af', glow: '#9ca3af' },
  rare:      { weight: 30, label: 'RARE',      color: '#3b82f6', glow: '#60a5fa' },
  epic:      { weight: 10, label: 'EPIC',      color: '#a855f7', glow: '#c084fc' },
  legendary: { weight: 5,  label: 'LEGENDARY', color: '#f59e0b', glow: '#fcd34d' },
  broken:    { weight: 3,  label: 'BROKEN',    color: '#ef4444', glow: '#f87171' },
  godly:     { weight: 2,  label: 'GODLY',     color: '#ec4899', glow: '#f9a8d4' },
};

// ── Effect catalogue ──────────────────────────────────────────────────────────

export type EffectType =
  // ── Existing ──
  | 'extra_turn'
  | 'shield_piece'
  | 'revive_piece'
  | 'promote_pawn'
  | 'swap_pieces'
  | 'block_nerf'
  | 'undo_move'
  | 'bonus_spin'
  | 'skip_turn'
  | 'freeze_piece'
  | 'lose_pawn'
  | 'downgrade_queen'
  | 'delay_spin'
  | 'force_pawn'
  | 'shuffle_pieces'
  // ── Common (new) ──
  | 'get_pawn'
  | 'get_knight'
  | 'double_spin'
  // ── Rare (new) ──
  | 'get_bishop'
  | 'get_rook'
  | 'no_backward'
  | 'chain_capture'
  | 'pawn_parry'
  | 'revolt_pawns'
  | 'clear_effects'
  | 'transfiguration'
  // ── Epic (new) ──
  | 'get_queen'
  | 'all_to_pawns'
  | 'randomize_pieces'
  | 'pawn_bomb'
  | 'car_diagonal'
  | 'illegal_move'
  | 'pawns_to_bishops'
  | 'ten_pawns'
  | 'time_rewind'
  // ── Legendary (new) ──
  | 'all_pieces_to_queens'
  | 'knights_rooks_swap'
  | 'five_spin'
  | 'six_knights'
  | 'heir_selection'
  | 'backrank_bomb'
  | 'claim_square'
  // ── Broken (new) ──
  | 'permanent_spin'
  | 'king_aura'
  | 'stockfish_advisor'
  | 'economy_sell'
  | 'pawn_sacrifice'
  | 'kidnap_piece'
  | 'royal_reversal'
  // ── Godly (new) ──
  | 'get_king'
  | 'rps_win';

export type TargetRule =
  | 'none'
  | 'own_piece'
  | 'opponent_piece'
  | 'opponent_non_pawn'
  | 'own_pawn'
  | 'own_non_king'
  | 'empty_square'
  | 'any_square'
  | 'two_own_pieces';

export interface EffectDef {
  label: string;
  emoji: string;
  description: string;
  category: 'buff' | 'nerf';
  rarity: Rarity;
  /** Turns the effect lasts; 0 = instant */
  duration: number;
  targetRule: TargetRule;
  /**
   * If true, landing on this effect puts it into the player's hand (up to 5)
   * instead of applying immediately. The player activates it whenever they choose.
   */
  holdable?: boolean;
}

export const EFFECTS: Record<EffectType, EffectDef> = {
  // ── Common ─────────────────────────────────────────────────────────────────
  extra_turn: {
    label: 'Extra Turn', emoji: '⏩',
    description: 'Take another turn immediately.',
    category: 'buff', rarity: 'common', duration: 0, targetRule: 'none',
  },
  skip_turn: {
    label: 'Skip Turn', emoji: '⏭️',
    description: "Your opponent loses their next turn.",
    category: 'nerf', rarity: 'common', duration: 1, targetRule: 'none',
  },
  lose_pawn: {
    label: 'Lose Pawn', emoji: '💀',
    description: 'Your opponent loses a random pawn.',
    category: 'nerf', rarity: 'common', duration: 0, targetRule: 'none',
  },
  delay_spin: {
    label: 'Delay Spin', emoji: '🕐',
    description: "Delay your opponent's next spin by 5 moves.",
    category: 'nerf', rarity: 'common', duration: 0, targetRule: 'none',
  },
  force_pawn: {
    label: 'Force Pawn', emoji: '♟️',
    description: 'Your opponent must move a pawn this turn (if able).',
    category: 'nerf', rarity: 'common', duration: 1, targetRule: 'none',
  },
  freeze_piece: {
    label: 'Freeze Piece', emoji: '❄️',
    description: "Freeze one of your opponent's pieces for 2 turns.",
    category: 'nerf', rarity: 'common', duration: 2, targetRule: 'opponent_piece',
    holdable: true,
  },
  get_pawn: {
    label: 'You Get a Pawn', emoji: '🐣',
    description: 'Place a free pawn on any empty square on your side.',
    category: 'buff', rarity: 'common', duration: 0, targetRule: 'empty_square',
  },
  get_knight: {
    label: 'You Get a Knight', emoji: '🐴',
    description: 'Place a free knight on any empty square.',
    category: 'buff', rarity: 'common', duration: 0, targetRule: 'empty_square',
  },
  double_spin: {
    label: '2× Spins', emoji: '🎲',
    description: 'Spin the wheel twice right now.',
    category: 'buff', rarity: 'common', duration: 0, targetRule: 'none',
  },

  // ── Rare ───────────────────────────────────────────────────────────────────
  shield_piece: {
    label: 'Shield Piece', emoji: '🛡️',
    description: 'Protect one of your pieces from capture for 2 turns.',
    category: 'buff', rarity: 'rare', duration: 2, targetRule: 'own_piece',
    holdable: true,
  },
  block_nerf: {
    label: 'Block Nerf', emoji: '🚫',
    description: "Block your opponent's next nerf.",
    category: 'buff', rarity: 'rare', duration: 3, targetRule: 'none',
  },
  undo_move: {
    label: 'Undo Move', emoji: '↩️',
    description: "Undo your opponent's last move.",
    category: 'buff', rarity: 'rare', duration: 0, targetRule: 'none',
    holdable: true,
  },
  bonus_spin: {
    label: 'Bonus Spin', emoji: '🎰',
    description: 'Spin the wheel again immediately.',
    category: 'buff', rarity: 'rare', duration: 0, targetRule: 'none',
  },
  downgrade_queen: {
    label: 'Downgrade Queen', emoji: '👑',
    description: "Your opponent's queen can only move like a rook for 3 turns.",
    category: 'nerf', rarity: 'rare', duration: 3, targetRule: 'none',
  },
  shuffle_pieces: {
    label: 'Shuffle Pieces', emoji: '🔀',
    description: "Randomly swap two of your opponent's non-king pieces.",
    category: 'nerf', rarity: 'rare', duration: 0, targetRule: 'none',
  },
  get_bishop: {
    label: 'You Get a Bishop', emoji: '⛪',
    description: 'Place a free bishop on any empty square.',
    category: 'buff', rarity: 'rare', duration: 0, targetRule: 'empty_square',
  },
  get_rook: {
    label: 'You Get a Rook', emoji: '🏰',
    description: 'Place a free rook on any empty square.',
    category: 'buff', rarity: 'rare', duration: 0, targetRule: 'empty_square',
  },
  no_backward: {
    label: 'No Retreat', emoji: '🚷',
    description: "Your opponent's pieces cannot move backward for 3 turns.",
    category: 'nerf', rarity: 'rare', duration: 3, targetRule: 'none',
  },
  chain_capture: {
    label: 'Chain Capture', emoji: '🔗',
    description: 'Your pawns can capture infinitely in one turn for 3 turns.',
    category: 'buff', rarity: 'rare', duration: 3, targetRule: 'none',
    holdable: true,
  },
  pawn_parry: {
    label: 'Pawn Parry', emoji: '🥊',
    description: 'Your pawns cannot be captured by queens or rooks for 3 turns.',
    category: 'buff', rarity: 'rare', duration: 3, targetRule: 'none',
    holdable: true,
  },
  transfiguration: {
    label: 'Transfiguration', emoji: '🔮',
    description: "Downgrade one enemy piece by one tier (Queen→Rook→Bishop→Pawn). Does not work on pawns or kings.",
    category: 'nerf', rarity: 'rare', duration: 0, targetRule: 'opponent_non_pawn',
    holdable: true,
  },
  revolt_pawns: {
    label: 'Pawn Revolt', emoji: '⚔️',
    description: "Your opponent's pawns switch sides — you control them for 3 turns!",
    category: 'buff', rarity: 'rare', duration: 3, targetRule: 'none',
  },
  clear_effects: {
    label: 'Purge', emoji: '🧹',
    description: 'Remove ALL active effects from both sides.',
    category: 'buff', rarity: 'rare', duration: 0, targetRule: 'none',
  },

  // ── Epic ───────────────────────────────────────────────────────────────────
  revive_piece: {
    label: 'Revive Piece', emoji: '💫',
    description: 'Place your highest-value captured piece on an empty square.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'empty_square',
    holdable: true,
  },
  promote_pawn: {
    label: 'Instant Promote', emoji: '🌟',
    description: 'Instantly promote one of your pawns to a queen.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'own_pawn',
  },
  swap_pieces: {
    label: 'Swap Pieces', emoji: '🔄',
    description: 'Swap the positions of two of your pieces.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'two_own_pieces',
  },
  get_queen: {
    label: 'You Get a Queen', emoji: '👸',
    description: 'Place a free queen on any empty square.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'empty_square',
  },
  all_to_pawns: {
    label: 'Pawnification', emoji: '🐛',
    description: "All of your opponent's non-king pieces become pawns.",
    category: 'nerf', rarity: 'epic', duration: 0, targetRule: 'none',
  },
  randomize_pieces: {
    label: 'Chaos Roll', emoji: '🎲',
    description: 'All your non-king pieces get random types.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'none',
  },
  pawn_bomb: {
    label: 'Pawn Bomb', emoji: '💣',
    description: 'Pick a pawn. It explodes — killing everything around it (including yours).',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'own_pawn',
  },
  car_diagonal: {
    label: 'Car Incoming!', emoji: '🚗',
    description: 'A car targets enemy pieces on a random diagonal. Strikes in 5 turns, then 4, 3, 2, 1 — escalating until it stops. Only enemy pieces are hit (kings are spared).',
    category: 'buff', rarity: 'epic', duration: 5, targetRule: 'none',
  },
  illegal_move: {
    label: 'Illegal Move', emoji: '🚨',
    description: 'Make one completely illegal move this turn — rules do not apply.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'none',
  },
  pawns_to_bishops: {
    label: 'Bishop Wave', emoji: '⛪',
    description: 'Your pawns become bishops, but you lose one bishop per turn for 3 turns.',
    category: 'buff', rarity: 'epic', duration: 3, targetRule: 'none',
  },
  ten_pawns: {
    label: '10 Pawns!', emoji: '🐾',
    description: 'Fill your back two ranks with 10 pawns.',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'none',
  },
  time_rewind: {
    label: 'Time Rewind', emoji: '⏪',
    description: 'Rewind 3 moves back (one-time ability, excludes spins).',
    category: 'buff', rarity: 'epic', duration: 0, targetRule: 'none',
  },

  // ── Legendary ──────────────────────────────────────────────────────────────
  all_pieces_to_queens: {
    label: 'Queen Army', emoji: '👑',
    description: 'All your non-king pieces become queens.',
    category: 'buff', rarity: 'legendary', duration: 0, targetRule: 'none',
  },
  knights_rooks_swap: {
    label: 'Knights & Rooks Swap', emoji: '🔃',
    description: 'Your knights become rooks and rooks become knights.',
    category: 'buff', rarity: 'legendary', duration: 0, targetRule: 'none',
  },
  five_spin: {
    label: '5× Spins', emoji: '🌀',
    description: 'Spin the wheel FIVE times right now.',
    category: 'buff', rarity: 'legendary', duration: 0, targetRule: 'none',
  },
  six_knights: {
    label: '6 Knights!', emoji: '🐴',
    description: 'Place 6 knights on your side, but you lose one random knight every turn.',
    category: 'buff', rarity: 'legendary', duration: 6, targetRule: 'none',
  },
  heir_selection: {
    label: 'Select an Heir', emoji: '🤴',
    description: "Pick a secret heir. Opponent doesn't know. If you're in checkmate, that piece becomes your new king.",
    category: 'buff', rarity: 'legendary', duration: 0, targetRule: 'own_non_king',
  },
  backrank_bomb: {
    label: 'Backrank Bomb', emoji: '💥',
    description: 'In 6 turns, both backranks explode — all pieces on ranks 1 and 8 die.',
    category: 'nerf', rarity: 'legendary', duration: 6, targetRule: 'none',
  },
  claim_square: {
    label: 'Claim Territory', emoji: '🚩',
    description: 'Claim one square. Any opponent piece that enters it is instantly destroyed.',
    category: 'buff', rarity: 'legendary', duration: 0, targetRule: 'empty_square',
  },

  // ── Broken ─────────────────────────────────────────────────────────────────
  permanent_spin: {
    label: 'Spin Machine', emoji: '⚙️',
    description: 'Permanently get +1 extra spin every time you reach a spin. Stacks!',
    category: 'buff', rarity: 'broken', duration: 0, targetRule: 'none',
  },
  king_aura: {
    label: 'King Aura', emoji: '☠️',
    description: "Opponent's pawns within 2 squares of your king die instantly for 3 turns.",
    category: 'buff', rarity: 'broken', duration: 3, targetRule: 'none',
  },
  stockfish_advisor: {
    label: 'Stockfish Advisor', emoji: '🧠',
    description: '2500 elo Stockfish analyzes every position, but loses 100 elo per turn until 600.',
    category: 'buff', rarity: 'broken', duration: 0, targetRule: 'none',
  },
  economy_sell: {
    label: 'Piece Market', emoji: '💰',
    description: 'Sell one of your pieces. Get a random piece back — better odds for better pieces sold.',
    category: 'buff', rarity: 'broken', duration: 0, targetRule: 'own_non_king',
  },
  pawn_sacrifice: {
    label: 'Pawn Sacrifice', emoji: '🌸',
    description: 'In 2 turns all your pawns die. In 5 turns you receive 25 pawns.',
    category: 'buff', rarity: 'broken', duration: 5, targetRule: 'none',
  },
  kidnap_piece: {
    label: 'Kidnap!', emoji: '🎭',
    description: "Kidnap one opponent piece for 2 turns. It disappears and reappears on its square.",
    category: 'nerf', rarity: 'broken', duration: 2, targetRule: 'opponent_piece',
  },
  royal_reversal: {
    label: 'Royal Reversal', emoji: '🃏',
    description: 'For 3 turns your opponent must capture YOUR queen to win — king is a decoy.',
    category: 'buff', rarity: 'broken', duration: 3, targetRule: 'none',
  },

  // ── Godly ──────────────────────────────────────────────────────────────────
  get_king: {
    label: 'You Get a King', emoji: '🔱',
    description: 'Place a second king on the board as an extra life. Opponent must capture both.',
    category: 'buff', rarity: 'godly', duration: 0, targetRule: 'empty_square',
  },
  rps_win: {
    label: 'Rock Paper Scissors', emoji: '✌️',
    description: 'Play best-of-3 rock-paper-scissors against your opponent. Winner takes the game!',
    category: 'buff', rarity: 'godly', duration: 0, targetRule: 'none',
  },
};

// ── Weighted random selection ─────────────────────────────────────────────────

export function selectWeightedEffect(enabledEffects: EffectType[]): EffectType {
  // Build total weight pool
  let totalWeight = 0;
  const weights: number[] = [];
  for (const e of enabledEffects) {
    const w = RARITY_CONFIG[EFFECTS[e].rarity].weight;
    weights.push(w);
    totalWeight += w;
  }
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < enabledEffects.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return enabledEffects[i];
  }
  return enabledEffects[enabledEffects.length - 1];
}

// ── State shapes ──────────────────────────────────────────────────────────────

export interface ActiveEffect {
  id: string;
  type: EffectType;
  duration: number;
  targetSquares: Square[];
  /** For kidnap_piece: the piece data stored away */
  kidnappedPiece?: { type: PieceSymbol; color: Color };
  /** For car_diagonal: which diagonal squares are affected */
  diagonalSquares?: Square[];
  /** For car_diagonal: current phase (5→4→3→2→1, stops at 0) */
  carDiagonalPhase?: number;
}

/** An ability held in a player's hand, activatable at any time on their turn. */
export interface HeldAbility {
  id: string;
  type: EffectType;
}

/** Maximum number of held abilities per player before the oldest is discarded. */
export const HAND_SIZE_LIMIT = 5;

export interface GambitState {
  fen: string;
  turn: Color;
  spinProgress: Record<Color, number>;
  /** Bonus spins added permanently (via permanent_spin) */
  permanentBonusSpins: Record<Color, number>;
  activeEffects: Record<Color, ActiveEffect[]>;
  capturedPieces: { type: PieceSymbol; color: Color }[];
  history: string[];
  /** Claimed squares (claim_square effect) */
  claimedSquares: Record<Color, Square[]>;
  /** Heir square selected (heir_selection effect) */
  heir: Record<Color, Square | null>;
  /** Royal reversal active (indexed by who activated it) */
  royalReversal: Record<Color, boolean>;
  /** Stockfish advisor elo (null = inactive) */
  stockfishElo: Record<Color, number | null>;
  /** Illegal move available */
  illegalMoveAvailable: Record<Color, boolean>;
  /** Revolt: whose pawns are currently revolted */
  revoltedColor: Color | null;
  /** Extra kings (get_king effect) */
  extraKings: Record<Color, Square[]>;
  /** RPS game pending */
  rpsPending: Color | null;
  /** RPS scores */
  rpsScore: Record<Color, number>;
  /** Held abilities (holdable effects waiting in hand) */
  heldAbilities: Record<Color, HeldAbility[]>;
  /** Duck Chess: current duck square (null = not yet placed) */
  duckSquare: Square | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Return squares occupied by `color` pieces, optionally filtered by `type`. */
export function getPieces(chess: Chess, color: Color, type?: PieceSymbol): Square[] {
  const squares: Square[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color && (type === undefined || cell.type === type)) {
        squares.push(cell.square);
      }
    }
  }
  return squares;
}

/** Return every square on the board. */
export function getAllSquares(): Square[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
  const squares: Square[] = [];
  for (const file of files) {
    for (const rank of ranks) {
      squares.push(`${file}${rank}` as Square);
    }
  }
  return squares;
}

/** Manhattan distance between two squares */
export function squareDistance(a: Square, b: Square): number {
  const fileDiff = Math.abs(a.charCodeAt(0) - b.charCodeAt(0));
  const rankDiff = Math.abs(parseInt(a[1]) - parseInt(b[1]));
  return Math.max(fileDiff, rankDiff);
}

/** Adjacent squares (Chebyshev distance 1) */
export function adjacentSquares(sq: Square): Square[] {
  const file = sq.charCodeAt(0); // 'a'=97
  const rank = parseInt(sq[1]);
  const result: Square[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = file + df;
      const nr = rank + dr;
      if (nf >= 97 && nf <= 104 && nr >= 1 && nr <= 8) {
        result.push(`${String.fromCharCode(nf)}${nr}` as Square);
      }
    }
  }
  return result;
}

/** Get all squares on one diagonal (both directions from start) */
export function getRandomDiagonal(): Square[] {
  // Pick a random diagonal (top-left to bottom-right or top-right to bottom-left)
  const diagonals: Square[][] = [];
  // / diagonals (anti-diagonals)
  for (let startFile = 0; startFile < 8; startFile++) {
    const diag: Square[] = [];
    let f = startFile, r = 0;
    while (f < 8 && r < 8) {
      diag.push(`${String.fromCharCode(97 + f)}${r + 1}` as Square);
      f++; r++;
    }
    if (diag.length >= 2) diagonals.push(diag);
  }
  for (let startRank = 1; startRank < 8; startRank++) {
    const diag: Square[] = [];
    let f = 0, r = startRank;
    while (f < 8 && r < 8) {
      diag.push(`${String.fromCharCode(97 + f)}${r + 1}` as Square);
      f++; r++;
    }
    if (diag.length >= 2) diagonals.push(diag);
  }
  return diagonals[Math.floor(Math.random() * diagonals.length)];
}

export const PIECE_VALUES: Record<PieceSymbol, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };

/** Pick a random piece type, weighted toward better pieces for higher-value sold piece */
export function randomPieceForValue(soldValue: number): PieceSymbol {
  const pool: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q'];
  // Weight toward pieces of similar or higher value
  const weights = pool.map(p => {
    const pv = PIECE_VALUES[p];
    if (pv >= soldValue) return 3;
    if (pv === soldValue - 1) return 2;
    return 1;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
