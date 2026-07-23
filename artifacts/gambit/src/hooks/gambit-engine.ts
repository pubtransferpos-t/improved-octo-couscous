import { Chess, Square, PieceSymbol, Color } from 'chess.js';

// ── Effect catalogue ──────────────────────────────────────────────────────────

export type EffectType =
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
  | 'shuffle_pieces';

export type TargetRule =
  | 'none'
  | 'own_piece'
  | 'opponent_piece'
  | 'own_pawn'
  | 'empty_square'
  | 'two_own_pieces';

export interface EffectDef {
  label: string;
  description: string;
  category: 'buff' | 'nerf';
  /** Turns the effect lasts; 0 = instant */
  duration: number;
  targetRule: TargetRule;
}

export const EFFECTS: Record<EffectType, EffectDef> = {
  // ── Buffs ──────────────────────────────────────────────────────────────────
  extra_turn: {
    label: 'Extra Turn',
    description: 'Take another turn immediately.',
    category: 'buff',
    duration: 0,
    targetRule: 'none',
  },
  shield_piece: {
    label: 'Shield Piece',
    description: 'Protect one of your pieces from capture for 2 turns.',
    category: 'buff',
    duration: 2,
    targetRule: 'own_piece',
  },
  revive_piece: {
    label: 'Revive Piece',
    description: 'Place your highest-value captured piece on an empty square.',
    category: 'buff',
    duration: 0,
    targetRule: 'empty_square',
  },
  promote_pawn: {
    label: 'Instant Promote',
    description: 'Instantly promote one of your pawns to a queen.',
    category: 'buff',
    duration: 0,
    targetRule: 'own_pawn',
  },
  swap_pieces: {
    label: 'Swap Pieces',
    description: 'Swap the positions of two of your pieces.',
    category: 'buff',
    duration: 0,
    targetRule: 'two_own_pieces',
  },
  block_nerf: {
    label: 'Block Nerf',
    description: "Block your opponent's next nerf.",
    category: 'buff',
    duration: 3,
    targetRule: 'none',
  },
  undo_move: {
    label: 'Undo Move',
    description: "Undo your opponent's last move.",
    category: 'buff',
    duration: 0,
    targetRule: 'none',
  },
  bonus_spin: {
    label: 'Bonus Spin',
    description: 'Spin the wheel again immediately.',
    category: 'buff',
    duration: 0,
    targetRule: 'none',
  },

  // ── Nerfs ──────────────────────────────────────────────────────────────────
  skip_turn: {
    label: 'Skip Turn',
    description: 'Your opponent loses their next turn.',
    category: 'nerf',
    duration: 1,
    targetRule: 'none',
  },
  freeze_piece: {
    label: 'Freeze Piece',
    description: "Freeze one of your opponent's pieces for 2 turns.",
    category: 'nerf',
    duration: 2,
    targetRule: 'opponent_piece',
  },
  lose_pawn: {
    label: 'Lose Pawn',
    description: 'Your opponent loses a random pawn.',
    category: 'nerf',
    duration: 0,
    targetRule: 'none',
  },
  downgrade_queen: {
    label: 'Downgrade Queen',
    description: "Your opponent's queen can only move like a rook for 3 turns.",
    category: 'nerf',
    duration: 3,
    targetRule: 'none',
  },
  delay_spin: {
    label: 'Delay Spin',
    description: "Delay your opponent's next spin by 5 moves.",
    category: 'nerf',
    duration: 0,
    targetRule: 'none',
  },
  force_pawn: {
    label: 'Force Pawn',
    description: 'Your opponent must move a pawn this turn (if able).',
    category: 'nerf',
    duration: 1,
    targetRule: 'none',
  },
  shuffle_pieces: {
    label: 'Shuffle Pieces',
    description: "Randomly swap two of your opponent's non-king pieces.",
    category: 'nerf',
    duration: 0,
    targetRule: 'none',
  },
};

// ── State shapes ──────────────────────────────────────────────────────────────

export interface ActiveEffect {
  id: string;
  type: EffectType;
  duration: number;
  targetSquares: Square[];
}

export interface GambitState {
  fen: string;
  turn: Color;
  spinProgress: Record<Color, number>;
  activeEffects: Record<Color, ActiveEffect[]>;
  capturedPieces: { type: PieceSymbol; color: Color }[];
  history: string[];
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
