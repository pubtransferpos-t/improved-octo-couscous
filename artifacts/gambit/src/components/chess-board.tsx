/**
 * Chess board — chess.com visual style.
 * Colors: light #eeeed2 / dark #769656  (exact chess.com green board palette)
 * Highlights: last-move yellow, selected green, legal-move dots.
 * Coordinates rendered inside the board squares (corner labels), matching chess.com.
 */

import { Chess, Move, Square, Color } from 'chess.js';
import { GambitState } from '@/hooks/gambit-engine';
import { ChessPiece } from './chess-pieces';

// Purple-tinted board with lavender + deep violet
const SQ_LIGHT      = '#d4c9e8';
const SQ_DARK       = '#3d2060';

const COORD_LIGHT   = '#3d2060';
const COORD_DARK    = '#d4c9e8';

interface ChessBoardProps {
  chess: Chess;
  state: GambitState;
  selectedSquare: Square | null;
  legalMoves: Move[];
  lastMove: { from: Square; to: Square } | null;
  onSquareClick: (sq: Square) => void;
  /** null = both sides playable. Otherwise board is oriented for this color. */
  playerColor: Color | null;
  effectTargeting: { effect: string; by: Color; step: number; selected: Square[] } | null;
  /** Duck Chess: square currently occupied by the duck */
  duckSquare?: Square | null;
}

export default function ChessBoard({
  chess,
  state,
  selectedSquare,
  legalMoves,
  lastMove,
  onSquareClick,
  playerColor,
  effectTargeting,
  duckSquare,
}: ChessBoardProps) {
  const board = chess.board();
  const isFlipped = playerColor === 'b';

  const legalTargets = new Set(legalMoves.map(m => m.to));
  const legalCaptures = new Set(
    legalMoves.filter(m => m.flags.includes('c') || m.flags.includes('e')).map(m => m.to),
  );

  const frozenSquares = new Set(
    [...state.activeEffects.w, ...state.activeEffects.b]
      .filter(e => e.type === 'freeze_piece')
      .flatMap(e => e.targetSquares),
  );
  const shieldedSquares = new Set(
    [...state.activeEffects.w, ...state.activeEffects.b]
      .filter(e => e.type === 'shield_piece')
      .flatMap(e => e.targetSquares),
  );
  const kidnappedSquares = new Set(
    [...state.activeEffects.w, ...state.activeEffects.b]
      .filter(e => e.type === 'kidnap_piece')
      .flatMap(e => e.targetSquares),
  );
  const carDiagonalSquares = new Set(
    [...state.activeEffects.w, ...state.activeEffects.b]
      .filter(e => e.type === 'car_diagonal' && e.diagonalSquares)
      .flatMap(e => e.diagonalSquares ?? []),
  );
  // Claimed squares by each color
  const claimedW = new Set(state.claimedSquares?.w ?? []);
  const claimedB = new Set(state.claimedSquares?.b ?? []);
  // Heir pieces
  const heirSquares = new Set([
    ...(state.heir?.w ? [state.heir.w] : []),
    ...(state.heir?.b ? [state.heir.b] : []),
  ]);

  const targetingSelected = new Set(effectTargeting?.selected ?? []);

  const files = isFlipped
    ? (['h','g','f','e','d','c','b','a'] as const)
    : (['a','b','c','d','e','f','g','h'] as const);
  const ranks = isFlipped
    ? (['1','2','3','4','5','6','7','8'] as const)
    : (['8','7','6','5','4','3','2','1'] as const);

  const rows = isFlipped ? [...board].reverse() : board;

  // Bottom rank index (for file labels) and left file index (for rank labels)
  const bottomRankIdx = 7;  // last row rendered
  const leftFileIdx   = 0;  // first column rendered

  return (
    <div className="inline-block select-none">
      {/* 8×8 grid — no wrapper divs for labels; labels live inside the squares */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          width: 'min(80vw, 520px, calc(100dvh - 240px))',
          height: 'min(80vw, 520px, calc(100dvh - 240px))',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, ri) => {
          const rank = ranks[ri];
          const displayRow = isFlipped ? [...row].reverse() : row;

          return displayRow.map((cell, fi) => {
            const file = files[fi];
            const sq = `${file}${rank}` as Square;

            /* base square colour */
            const isLight = (ri + fi) % 2 === 0;
            const baseBg       = isLight ? SQ_LIGHT : SQ_DARK;
            const coordColor   = isLight ? COORD_LIGHT : COORD_DARK;

            /* highlight overlays */
            const isLastMove =
              lastMove && (sq === lastMove.from || sq === lastMove.to);
            const isSelected =
              sq === selectedSquare || targetingSelected.has(sq);
            const isLegalTarget = legalTargets.has(sq);
            const isFrozen   = frozenSquares.has(sq);
            const isShielded = shieldedSquares.has(sq);

            /* coordinate labels — rank on left-edge squares, file on bottom-edge squares */
            const showRankLabel = fi === leftFileIdx;
            const showFileLabel = ri === bottomRankIdx;

            return (
              <div
                key={sq}
                onClick={() => onSquareClick(sq)}
                className="relative cursor-pointer"
                style={{ backgroundColor: baseBg, aspectRatio: '1' }}
              >
                {/* Last-move tint */}
                {isLastMove && !isSelected && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: 'rgba(155,199,0,0.41)' }}
                  />
                )}

                {/* Selected tint */}
                {isSelected && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: 'rgba(20,85,30,0.5)' }}
                  />
                )}

                {/* Legal move indicator — dot for empty, ring for capture */}
                {isLegalTarget && !cell && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      style={{
                        width: '33%',
                        height: '33%',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.20)',
                      }}
                    />
                  </div>
                )}
                {isLegalTarget && cell && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      borderRadius: '50%',
                      boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.20)',
                    }}
                  />
                )}

                {/* Rank label — top-left corner of left-edge squares */}
                {showRankLabel && (
                  <span
                    className="absolute top-[3px] left-[3px] font-bold leading-none pointer-events-none z-20"
                    style={{ fontSize: 'min(1.8vw, 11px)', color: coordColor }}
                  >
                    {rank}
                  </span>
                )}

                {/* File label — bottom-right corner of bottom-edge squares */}
                {showFileLabel && (
                  <span
                    className="absolute bottom-[3px] right-[3px] font-bold leading-none pointer-events-none z-20"
                    style={{ fontSize: 'min(1.8vw, 11px)', color: coordColor }}
                  >
                    {file}
                  </span>
                )}

                {/* Claimed square overlay */}
                {(claimedW.has(sq) || claimedB.has(sq)) && (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: claimedW.has(sq) ? 'rgba(255,238,0,0.18)' : 'rgba(0,245,255,0.18)',
                    border: `2px solid ${claimedW.has(sq) ? '#ffee00' : '#00f5ff'}`,
                    boxSizing: 'border-box',
                  }} />
                )}

                {/* Car diagonal warning */}
                {carDiagonalSquares.has(sq) && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{
                    background: 'rgba(255,50,0,0.18)',
                    border: '2px solid rgba(255,100,0,0.8)',
                    boxSizing: 'border-box',
                    fontSize: 'min(1.5vw, 9px)', zIndex: 8,
                  }}>
                    <span style={{ fontSize: 'min(3vw, 14px)' }}>🚗</span>
                  </div>
                )}

                {/* Kidnapped square */}
                {kidnappedSquares.has(sq) && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{
                    background: 'rgba(160,0,255,0.2)', border: '2px dashed rgba(160,0,255,0.8)',
                    boxSizing: 'border-box', zIndex: 8,
                  }}>
                    <span style={{ fontSize: 'min(3vw, 14px)' }}>🎭</span>
                  </div>
                )}

                {/* Duck Chess: duck square */}
                {duckSquare === sq && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{
                    background: 'rgba(255,200,0,0.25)',
                    border: '2px solid rgba(255,180,0,0.9)',
                    boxSizing: 'border-box', zIndex: 9,
                  }}>
                    <span style={{ fontSize: 'min(4vw, 18px)', lineHeight: 1 }}>🦆</span>
                  </div>
                )}

                {/* Effect badges */}
                {(isFrozen || isShielded || heirSquares.has(sq)) && (
                  <div className="absolute top-0.5 right-0.5 z-10 text-[8px] leading-none pointer-events-none">
                    {isFrozen && '❄'}
                    {isShielded && '🛡'}
                    {heirSquares.has(sq) && '🤴'}
                  </div>
                )}

                {/* Piece */}
                {cell && (
                  <div className="absolute inset-0 p-[5%]">
                    <ChessPiece piece={cell} />
                  </div>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
