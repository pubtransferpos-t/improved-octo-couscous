/**
 * SVG chess pieces — CBurnett-style Staunton set (same visual family as Lichess default).
 * Each piece rendered in a 45×45 viewBox.
 * White pieces: white fill, dark stroke.
 * Black pieces: dark fill, light stroke.
 */

import React from 'react';

type PColor = 'w' | 'b';

/* ─── color tokens ────────────────────────────────────────────────────────── */
const FILL   = { w: '#ffffff', b: '#292929' };
const STROKE = { w: '#333333', b: '#e8e8e8' };
// A second, lighter/darker colour used for inner details so they read on both square colours.
const DETAIL = { w: '#333333', b: '#bbbbbb' };

interface PieceProps { color: PColor; }

function PieceSvg({ color, children }: PieceProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45 45"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <g
        fill={FILL[color]}
        stroke={STROKE[color]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

/* ─── Pawn ────────────────────────────────────────────────────────────────── */
export function Pawn({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      <path d="M 22,9 C 19.79,9 18,10.79 18,13 C 18,13.89 18.29,14.71 18.78,15.38 C 16.83,16.5 15.5,18.59 15.5,21 C 15.5,23.03 16.44,24.84 17.91,26.03 C 14.91,27.09 10.5,31.58 10.5,39.5 L 33.5,39.5 C 33.5,31.58 29.09,27.09 26.09,26.03 C 27.56,24.84 28.5,23.03 28.5,21 C 28.5,18.59 27.17,16.5 25.22,15.38 C 25.71,14.71 26,13.89 26,13 C 26,10.79 24.21,9 22,9 z" />
    </PieceSvg>
  );
}

/* ─── Rook ────────────────────────────────────────────────────────────────── */
export function Rook({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      <path d="M 9,39 L 36,39 L 36,36 L 33,36 L 33,13 L 36,13 L 36,9 L 30,9 L 30,12 L 26,12 L 26,9 L 19,9 L 19,12 L 15,12 L 15,9 L 9,9 L 9,13 L 12,13 L 12,36 L 9,36 z" />
      <line x1="14" y1="29.5" x2="31" y2="29.5" stroke={DETAIL[color]} strokeWidth="1" />
      <line x1="14" y1="16.5" x2="31" y2="16.5" stroke={DETAIL[color]} strokeWidth="1" />
    </PieceSvg>
  );
}

/* ─── Knight ──────────────────────────────────────────────────────────────── */
export function Knight({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      {/* Main body silhouette */}
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
      {/* Head / face detail */}
      <path
        d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31
           C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30
           5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5
           C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10
           L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"
      />
      {/* Eye */}
      <circle cx="13.5" cy="19" r="1.5" fill={STROKE[color]} stroke="none" />
    </PieceSvg>
  );
}

/* ─── Bishop ──────────────────────────────────────────────────────────────── */
export function Bishop({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      {/* Flat base platform */}
      <path d="M 9,39 L 36,39 L 36,36 C 27,35 18,35 9,36 z" />
      {/* Lower body — wide skirt */}
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 22.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" />
      {/* Miter body — tall pointed head */}
      <path d="M 22.5,10 C 17,14 13.5,18 13.5,23 C 13.5,25.5 15,26 22.5,26 C 30,26 31.5,25.5 31.5,23 C 31.5,18 28,14 22.5,10 z" />
      {/* Miter tip */}
      <path d="M 20,8 C 20,8 21,5 22.5,5 C 24,5 25,8 25,8 C 25,9 24,10 22.5,10 C 21,10 20,9 20,8 z" />
      {/* Top ball */}
      <circle cx="22.5" cy="5" r="1.5" fill={STROKE[color]} stroke="none" />
      {/* Horizontal band separating skirt from body */}
      <line x1="15" y1="26" x2="30" y2="26" stroke={DETAIL[color]} strokeWidth="1" />
      {/* Diagonal notch / cross slit on miter */}
      <line x1="17" y1="23" x2="28" y2="23" stroke={DETAIL[color]} strokeWidth="1" />
    </PieceSvg>
  );
}

/* ─── Queen ───────────────────────────────────────────────────────────────── */
export function Queen({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      {/* Crown balls */}
      <circle cx="9"    cy="12"  r="2.5" />
      <circle cx="22.5" cy="9"   r="2.5" />
      <circle cx="36"   cy="12"  r="2.5" />
      <circle cx="15.5" cy="17"  r="2.5" />
      <circle cx="29.5" cy="17"  r="2.5" />
      {/* Crown body */}
      <path
        d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 22.5,24.5
           L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"
      />
      {/* Lower body */}
      <path
        d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5
           C 10.5,34.5 11,36 11,36 C 9,37.5 11,38.5 22.5,38.5
           C 34,38.5 36,37.5 34,36 C 34,36 34.5,34.5 33,33.5
           C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26
           C 27.5,24.5 17.5,24.5 9,26 z"
      />
      {/* Waist lines */}
      <line x1="11.5" y1="30"   x2="33.5" y2="30"   stroke={DETAIL[color]} strokeWidth="1" />
      <line x1="12"   y1="33.5" x2="33"   y2="33.5" stroke={DETAIL[color]} strokeWidth="1" />
    </PieceSvg>
  );
}

/* ─── King ────────────────────────────────────────────────────────────────── */
export function King({ color }: PieceProps) {
  return (
    <PieceSvg color={color}>
      {/* Cross */}
      <line x1="22.5" y1="11.63" x2="22.5" y2="6"   strokeWidth="2" />
      <line x1="20"   y1="8"     x2="25"   y2="8"    strokeWidth="2" />
      {/* Crown shape */}
      <path
        d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12
           C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25"
      />
      {/* Body */}
      <path
        d="M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5
           C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5
           C 3.5,25.5 11.5,29.5 11.5,30 z"
      />
      {/* Waist lines */}
      <line x1="11.5" y1="30"   x2="32.5" y2="30"   stroke={DETAIL[color]} strokeWidth="1" />
      <line x1="11.5" y1="33.5" x2="32.5" y2="33.5" stroke={DETAIL[color]} strokeWidth="1" />
    </PieceSvg>
  );
}

/* ─── Lookup ──────────────────────────────────────────────────────────────── */
const MAP: Record<string, React.ComponentType<PieceProps>> = {
  p: Pawn, r: Rook, n: Knight, b: Bishop, q: Queen, k: King,
};

export function ChessPiece({
  piece,
}: {
  piece: { type: string; color: PColor };
}) {
  const Comp = MAP[piece.type];
  if (!Comp) return null;
  return <Comp color={piece.color} />;
}
