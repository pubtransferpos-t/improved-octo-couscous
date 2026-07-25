/**
 * Gambit – Gamble Chess: Durable Object per game room
 * Each room holds authoritative game state for two online players.
 */

import { Chess } from 'chess.js';

export interface Move {
  from: string;
  to: string;
  promotion?: string;
}

export interface Effect {
  type: string;
  params?: Record<string, unknown>;
}

export interface RoomState {
  roomId: string;
  hostColor: "white";
  guestColor: "black";
  guestJoined: boolean;
  fen: string; // Current board FEN
  turn: "white" | "black";
  moveCount: number; // Total half-moves made
  moveHistory: string[]; // Algebraic notation history
  fenHistory: string[]; // FEN snapshots for undo
  capturedPieces: {
    white: string[]; // pieces white has captured
    black: string[]; // pieces black has captured
  };
  activeEffects: ActiveEffect[];
  spinEligibility: {
    white: number; // moveCount at which white next earns a spin
    black: number;
  };
  status: "waiting" | "playing" | "checkmate" | "stalemate" | "draw" | "resigned";
  winner?: "white" | "black";
  lastActivity: number; // epoch ms, for cleanup
}

export interface ActiveEffect {
  color: "white" | "black"; // which player is affected
  type: string;
  turnsRemaining: number;
  params?: Record<string, unknown>;
}

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DEFAULT_SPIN_INTERVAL = 5;

export class GameRoom {
  private state: DurableObjectState;
  private room: RoomState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async loadRoom(): Promise<RoomState | null> {
    if (this.room) return this.room;
    this.room = (await this.state.storage.get<RoomState>("room")) ?? null;
    return this.room;
  }

  private async saveRoom(room: RoomState): Promise<void> {
    this.room = room;
    await this.state.storage.put("room", room);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    const pathParts = url.pathname.replace(/^\/rooms\/?/, "").split("/");
    // pathParts[0] = roomId (already baked into the DO id routing)
    const action = pathParts[1] ?? "";

    try {
      if (method === "POST" && !action) {
        return cors(await this.handleCreate(request, url));
      }
      if (method === "POST" && action === "join") {
        return cors(await this.handleJoin(request));
      }
      if (method === "GET" && action === "state") {
        return cors(await this.handleGetState());
      }
      if (method === "POST" && action === "move") {
        return cors(await this.handleMove(request));
      }
      if (method === "POST" && action === "effect") {
        return cors(await this.handleEffect(request));
      }
      if (method === "POST" && action === "resign") {
        return cors(await this.handleResign(request));
      }
      return cors(new Response(JSON.stringify({ error: "Not found" }), { status: 404 }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return cors(new Response(JSON.stringify({ error: msg }), { status: 500 }));
    }
  }

  private async handleCreate(request: Request, url: URL): Promise<Response> {
    const existing = await this.loadRoom();
    if (existing) {
      return new Response(JSON.stringify({ roomId: existing.roomId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const roomId = url.searchParams.get("roomId") ?? randomRoomId();
    const spinInterval = Number(url.searchParams.get("spinInterval") ?? DEFAULT_SPIN_INTERVAL);

    const room: RoomState = {
      roomId,
      hostColor: "white",
      guestColor: "black",
      guestJoined: false,
      fen: INITIAL_FEN,
      turn: "white",
      moveCount: 0,
      moveHistory: [],
      fenHistory: [INITIAL_FEN],
      capturedPieces: { white: [], black: [] },
      activeEffects: [],
      spinEligibility: {
        white: spinInterval,
        black: spinInterval,
      },
      status: "waiting",
      lastActivity: Date.now(),
    };

    await this.saveRoom(room);
    return new Response(JSON.stringify({ roomId }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }
    if (room.guestJoined) {
      return new Response(JSON.stringify({ color: "black", roomId: room.roomId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    room.guestJoined = true;
    room.status = "playing";
    room.lastActivity = Date.now();
    await this.saveRoom(room);

    return new Response(JSON.stringify({ color: "black", roomId: room.roomId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleGetState(): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }
    return new Response(JSON.stringify(room), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleMove(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }
    if (room.status !== "playing") {
      return new Response(JSON.stringify({ error: "Game is not active", room }), { status: 400 });
    }

    type MoveBody = {
      move: Move;
      color: "white" | "black";
      resultFen?: string;
      algebraic?: string;
      captured?: string;
      status?: "playing" | "checkmate" | "stalemate" | "draw";
    };
    const body = await request.json<MoveBody>();
    const { move, color } = body;

    // Record pre-move FEN for undo history
    room.fenHistory.push(room.fen);

    // Attempt server-side move validation using chess.js.
    // This is the authoritative path for ordinary moves.
    const chess = new Chess(room.fen);
    let moveResult: ReturnType<typeof chess.move> | null = null;
    try {
      moveResult = chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
    } catch {
      moveResult = null;
    }

    if (moveResult) {
      // ── Server-validated path ──────────────────────────────────────────────
      // Use the FEN computed by the server's chess.js as the authoritative state.
      room.fen = chess.fen();
      room.moveHistory.push(moveResult.san);
      if (moveResult.captured) {
        room.capturedPieces[color].push(moveResult.captured);
      }
      // Derive turn from the post-move FEN (handles castling, en-passant, etc.)
      room.turn = chess.turn() === "w" ? "white" : "black";

      // Check server-side game termination
      if (chess.isCheckmate()) {
        room.status = "checkmate";
        room.winner = color;
      } else if (chess.isStalemate()) {
        room.status = "stalemate";
      } else if (chess.isDraw()) {
        room.status = "draw";
      }
    } else if (body.resultFen) {
      // ── Effect-modified path ───────────────────────────────────────────────
      // chess.js couldn't validate the move against the server FEN — most
      // likely because a client-side effect (e.g. skip_turn, extra_turn)
      // already mutated the active turn before the client sent this move.
      // Trust the client-supplied resultFen for these cases.
      room.fen = body.resultFen;
      if (body.algebraic) room.moveHistory.push(body.algebraic);
      if (body.captured) room.capturedPieces[color].push(body.captured);
      // Parse the active turn from the FEN string
      const fenTurn = body.resultFen.split(" ")[1];
      room.turn = fenTurn === "w" ? "white" : "black";
      // Accept client-reported game status
      if (body.status && body.status !== "playing") {
        room.status = body.status;
        if (body.status === "checkmate") room.winner = color;
      }
    } else {
      // Neither valid nor has a fallback FEN — reject and undo the history push
      room.fenHistory.pop();
      return cors(
        new Response(JSON.stringify({ error: "Invalid move", room }), { status: 400 })
      );
    }

    room.moveCount += 1;

    // Tick down active effects for the player who just moved
    room.activeEffects = room.activeEffects
      .map((e) => {
        if (e.color === color) {
          return { ...e, turnsRemaining: e.turnsRemaining - 1 };
        }
        return e;
      })
      .filter((e) => e.turnsRemaining > 0);

    room.lastActivity = Date.now();
    await this.saveRoom(room);

    return new Response(JSON.stringify(room), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleEffect(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }

    const body = await request.json<{
      effect: Effect;
      color: "white" | "black";
      resultFen?: string;
      spinInterval: number;
    }>();

    const { effect, color, resultFen, spinInterval } = body;

    // Apply board changes if provided
    if (resultFen) {
      room.fenHistory.push(room.fen);
      room.fen = resultFen;
      // Parse turn from new FEN
      const fenTurn = resultFen.split(" ")[1];
      room.turn = fenTurn === "w" ? "white" : "black";
    }

    // Register timed effect if applicable
    const timedEffects: Record<string, { turns: number; targetColor: "white" | "black" }> = {
      shield_piece:      { turns: 2, targetColor: color },
      freeze_piece:      { turns: 2, targetColor: color === "white" ? "black" : "white" },
      downgrade_queen:   { turns: 3, targetColor: color === "white" ? "black" : "white" },
      skip_turn:         { turns: 1, targetColor: color === "white" ? "black" : "white" },
      block_nerf:        { turns: 1, targetColor: color },
      force_pawn:        { turns: 1, targetColor: color === "white" ? "black" : "white" },
    };

    if (timedEffects[effect.type]) {
      const { turns, targetColor } = timedEffects[effect.type];
      room.activeEffects.push({
        color: targetColor,
        type: effect.type,
        turnsRemaining: turns,
        params: effect.params,
      });
    }

    // Handle delay spin effect
    if (effect.type === "delay_spin") {
      const opp = color === "white" ? "black" : "white";
      room.spinEligibility[opp] += 5;
    }

    // Advance spin eligibility for the player who just used their spin.
    // This is the critical step that prevents "spin every turn" — the next
    // eligible spin count is pushed forward by spinInterval from the current
    // moveCount.
    const effectiveSpin = spinInterval ?? DEFAULT_SPIN_INTERVAL;
    room.spinEligibility[color] = room.moveCount + effectiveSpin;

    room.lastActivity = Date.now();
    await this.saveRoom(room);

    return new Response(JSON.stringify(room), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleResign(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }

    const body = await request.json<{ color: "white" | "black" }>();
    room.status = "resigned";
    room.winner = body.color === "white" ? "black" : "white";
    room.lastActivity = Date.now();
    await this.saveRoom(room);

    return new Response(JSON.stringify(room), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

function randomRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
