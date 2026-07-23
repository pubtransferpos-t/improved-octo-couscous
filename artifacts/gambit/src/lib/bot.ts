import { Chess } from 'chess.js';

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

const PST: Record<string, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function squareIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return (7 - rank) * 8 + file;
}

function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -99999 : 99999;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  let score = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const val = PIECE_VALUES[cell.type] ?? 0;
      const pst = PST[cell.type] ?? [];
      const idx = cell.color === 'w' ? squareIndex(cell.square) : 63 - squareIndex(cell.square);
      score += cell.color === 'w' ? val + (pst[idx] ?? 0) : -(val + (pst[idx] ?? 0));
    }
  }
  return score;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  const moves = chess.moves({ verbose: true });
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Map ELO to search depth and noise (probability of picking a random move).
 * Lower ELO = shallower search + higher chance of a random blunder.
 */
function eloToParams(elo: number): { depth: number; noisePct: number } {
  if (elo < 600)  return { depth: 1, noisePct: 0.70 };
  if (elo < 900)  return { depth: 1, noisePct: 0.40 };
  if (elo < 1100) return { depth: 1, noisePct: 0.20 };
  if (elo < 1300) return { depth: 2, noisePct: 0.08 };
  if (elo < 1500) return { depth: 2, noisePct: 0.02 };
  if (elo < 1800) return { depth: 2, noisePct: 0.00 };
  if (elo < 2200) return { depth: 3, noisePct: 0.00 };
  return              { depth: 3, noisePct: 0.00 };
}

/**
 * allowedMoves — effect-filtered legal moves from the Gambit engine.
 * When provided, getBotMove restricts its search to only those from/to pairs
 * so it never returns a move that makeMove() would reject.
 */
export function getBotMove(
  fen: string,
  botElo: number,
  allowedMoves?: { from: string; to: string; promotion?: string }[],
) {
  const chess = new Chess(fen);
  const { depth, noisePct } = eloToParams(botElo);

  // Get all chess.js moves, then intersect with allowedMoves if provided.
  let moves = chess.moves({ verbose: true });
  console.log('[bot] raw chess.js moves count:', moves.length, '| elo:', botElo, '| depth:', depth, '| noise:', noisePct);

  if (allowedMoves && allowedMoves.length > 0) {
    const allowed = new Set(allowedMoves.map(m => `${m.from}${m.to}${m.promotion ?? ''}`));
    moves = moves.filter(m => allowed.has(`${m.from}${m.to}${m.promotion ?? ''}`));
    console.log('[bot] moves after effect-filter:', moves.length);
  } else if (allowedMoves && allowedMoves.length === 0) {
    console.warn('[bot] allowedMoves list is empty — no legal moves under current effects');
    return null;
  }

  if (moves.length === 0) {
    console.warn('[bot] no moves available after filtering');
    return null;
  }

  // Shuffle for variety at equal scores
  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  // Low-ELO noise: just pick a random move sometimes
  if (noisePct > 0 && Math.random() < noisePct) {
    const randomPick = shuffled[0];
    console.log('[bot] noise blunder:', randomPick.from, '->', randomPick.to);
    return randomPick;
  }

  const maximizing = chess.turn() === 'w';
  let bestMove = shuffled[0];
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of shuffled) {
    chess.move(move);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !maximizing);
    chess.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  console.log('[bot] chosen move:', bestMove.from, '->', bestMove.to, '| score:', bestScore);
  return bestMove;
}
