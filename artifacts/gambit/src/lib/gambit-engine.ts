import { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';

export type EffectType = 
  | 'extra_turn' | 'shield_piece' | 'revive_piece' | 'promote_pawn' | 'swap_pieces' | 'block_nerf' | 'undo_move' | 'bonus_spin'
  | 'skip_turn' | 'freeze_piece' | 'lose_pawn' | 'downgrade_queen' | 'delay_spin' | 'force_pawn' | 'shuffle_pieces';

export type TargetRule = 'none' | 'own_piece' | 'own_pawn' | 'empty_square' | 'two_own_pieces' | 'opponent_piece';

export interface EffectDef {
  type: EffectType;
  name: string;
  desc: string;
  duration: number;
  targetRule: TargetRule;
  category: 'buff' | 'nerf';
}

export const EFFECTS: Record<EffectType, EffectDef> = {
  // Buffs
  extra_turn: { type: 'extra_turn', name: 'Time Walk', desc: 'Take another move immediately.', duration: 0, targetRule: 'none', category: 'buff' },
  shield_piece: { type: 'shield_piece', name: 'Aegis', desc: 'Shield a piece. It cannot be captured for 3 turns.', duration: 3, targetRule: 'own_piece', category: 'buff' },
  revive_piece: { type: 'revive_piece', name: 'Resurrection', desc: 'Revive a captured piece to an empty square.', duration: 0, targetRule: 'empty_square', category: 'buff' },
  promote_pawn: { type: 'promote_pawn', name: 'Ascension', desc: 'Instantly promote a pawn to a Queen.', duration: 0, targetRule: 'own_pawn', category: 'buff' },
  swap_pieces: { type: 'swap_pieces', name: 'Transposition', desc: 'Swap the positions of two of your pieces.', duration: 0, targetRule: 'two_own_pieces', category: 'buff' },
  block_nerf: { type: 'block_nerf', name: 'Ward', desc: 'Immune to the next nerf applied to you.', duration: 999, targetRule: 'none', category: 'buff' },
  undo_move: { type: 'undo_move', name: 'Rewind', desc: 'Undo the opponent’s last move.', duration: 0, targetRule: 'none', category: 'buff' },
  bonus_spin: { type: 'bonus_spin', name: 'Fate’s Favor', desc: 'Spin the wheel again.', duration: 0, targetRule: 'none', category: 'buff' },
  // Nerfs
  skip_turn: { type: 'skip_turn', name: 'Paralysis', desc: 'Opponent loses their next turn.', duration: 0, targetRule: 'none', category: 'nerf' },
  freeze_piece: { type: 'freeze_piece', name: 'Deep Freeze', desc: 'Target opponent piece cannot move for 2 turns.', duration: 2, targetRule: 'opponent_piece', category: 'nerf' },
  lose_pawn: { type: 'lose_pawn', name: 'Tithe', desc: 'Remove a random opponent pawn.', duration: 0, targetRule: 'none', category: 'nerf' },
  downgrade_queen: { type: 'downgrade_queen', name: 'Usurpation', desc: 'Opponent Queen moves like a Rook for 3 turns.', duration: 3, targetRule: 'none', category: 'nerf' },
  delay_spin: { type: 'delay_spin', name: 'Misfortune', desc: 'Push back opponent spin eligibility by 5 moves.', duration: 0, targetRule: 'none', category: 'nerf' },
  force_pawn: { type: 'force_pawn', name: 'Conscription', desc: 'Opponent must move a pawn on their next turn.', duration: 1, targetRule: 'none', category: 'nerf' },
  shuffle_pieces: { type: 'shuffle_pieces', name: 'Chaos', desc: 'Randomly swap two opponent pieces.', duration: 0, targetRule: 'none', category: 'nerf' },
};

export interface ActiveEffect {
  id: string;
  type: EffectType;
  duration: number;
  targetSquares: Square[];
}

export interface GambitState {
  fen: string;
  turn: Color;
  spinProgress: { w: number; b: number };
  activeEffects: { w: ActiveEffect[]; b: ActiveEffect[] };
  capturedPieces: { type: PieceSymbol; color: Color }[];
  history: string[]; 
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Get all squares a piece type is on
export function getPieces(chess: Chess, color: Color, type?: PieceSymbol): Square[] {
  const squares: Square[] = [];
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && (!type || p.type === type)) {
        const sq = String.fromCharCode(97 + c) + (8 - r) as Square;
        squares.push(sq);
      }
    }
  }
  return squares;
}

export function getAllSquares(): Square[] {
  const sq: Square[] = [];
  for (let r = 1; r <= 8; r++) {
    for (let c = 0; c < 8; c++) {
      sq.push(String.fromCharCode(97 + c) + r as Square);
    }
  }
  return sq;
}
