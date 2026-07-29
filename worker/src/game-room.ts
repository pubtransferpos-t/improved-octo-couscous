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

export interface ChatMessage {
  author: 'white' | 'black' | 'spectator' | 'system';
  text: string;
  ts: number;
}

export type GameMode = 'standard' | 'chess960' | 'duck_chess' | 'bughouse' | 'four_player' | 'live_action' | 'chess_checkers';

export interface RoomState {
  roomId: string;
  hostColor: "white";
  guestColor: "black";
  guestJoined: boolean;
  fen: string;
  turn: "white" | "black";
  moveCount: number;
  moveHistory: string[];
  fenHistory: string[];
  capturedPieces: {
    white: string[];
    black: string[];
  };
  activeEffects: ActiveEffect[];
  spinEligibility: {
    white: number;
    black: number;
  };
  stockfishElo: {
    white: number | null;
    black: number | null;
  };
  status: "waiting" | "playing" | "checkmate" | "stalemate" | "draw" | "resigned" | "draw_offered";
  winner?: "white" | "black";
  lastActivity: number;
  /** Draw offer in progress */
  drawOffer?: { from: "white" | "black"; offeredAt: number };
  /** In-game chat messages (last 200 kept) */
  chatMessages: ChatMessage[];
  /** Number of spectators currently watching */
  spectatorCount: number;
  /** Game mode variant */
  gameMode: GameMode;
  /** Whether this room is listed publicly in the lobby */
  isPublic: boolean;
  /** Slowmode: epoch ms of last chat message per color */
  lastChatAt: { white: number; black: number; spectator: number };
  /** Duck Chess: current duck square, null means not yet placed */
  duckSquare?: string | null;
}

export interface ActiveEffect {
  color: "white" | "black";
  type: string;
  turnsRemaining: number;
  params?: Record<string, unknown>;
}

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DEFAULT_SPIN_INTERVAL = 5;
const CHAT_SLOWMODE_MS = 5000;
const MAX_CHAT_MESSAGES = 200;

// Simple profanity filter: block obvious slurs/bad words
const BLOCKED_WORDS = /\b(fuck|shit|ass|bitch|cunt|dick|nigger|faggot|retard)\b/gi;
function filterChat(text: string): string {
  return text.replace(BLOCKED_WORDS, m => '*'.repeat(m.length));
}

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

    if (method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    const pathParts = url.pathname.replace(/^\/rooms\/?/, "").split("/");
    const action = pathParts[1] ?? "";

    try {
      if (method === "POST" && !action) return cors(await this.handleCreate(request, url));
      if (method === "POST" && action === "join") return cors(await this.handleJoin(request));
      if (method === "GET" && action === "state") return cors(await this.handleGetState());
      if (method === "POST" && action === "move") return cors(await this.handleMove(request));
      if (method === "POST" && action === "effect") return cors(await this.handleEffect(request));
      if (method === "POST" && action === "sync-fen") return cors(await this.handleSyncFen(request));
      if (method === "POST" && action === "resign") return cors(await this.handleResign(request));
      if (method === "POST" && action === "draw") return cors(await this.handleDraw(request));
      if (method === "POST" && action === "chat") return cors(await this.handleChat(request));
      if (method === "POST" && action === "spectate") return cors(await this.handleSpectate());
      if (method === "POST" && action === "spectate-leave") return cors(await this.handleSpectateLeave());
      if (method === "POST" && action === "duck") return cors(await this.handleDuck(request));
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
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const roomId = url.searchParams.get("roomId") ?? randomRoomId();
    const spinInterval = Number(url.searchParams.get("spinInterval") ?? DEFAULT_SPIN_INTERVAL);
    const gameMode = (url.searchParams.get("gameMode") ?? "standard") as GameMode;
    const isPublic = url.searchParams.get("isPublic") === "true";
    const initialFen = url.searchParams.get("initialFen") ?? INITIAL_FEN;

    // Validate the initial FEN
    let fen = INITIAL_FEN;
    try {
      const ch = new Chess(initialFen);
      fen = ch.fen();
    } catch {
      fen = INITIAL_FEN;
    }

    const room: RoomState = {
      roomId,
      hostColor: "white",
      guestColor: "black",
      guestJoined: false,
      fen,
      turn: "white",
      moveCount: 0,
      moveHistory: [],
      fenHistory: [fen],
      capturedPieces: { white: [], black: [] },
      activeEffects: [],
      spinEligibility: { white: spinInterval, black: spinInterval },
      stockfishElo: { white: null, black: null },
      status: "waiting",
      lastActivity: Date.now(),
      chatMessages: [],
      spectatorCount: 0,
      gameMode,
      isPublic,
      lastChatAt: { white: 0, black: 0, spectator: 0 },
    };

    await this.saveRoom(room);
    return new Response(JSON.stringify({ roomId, gameMode }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (room.guestJoined) {
      return new Response(JSON.stringify({ color: "black", roomId: room.roomId, gameMode: room.gameMode }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    room.guestJoined = true;
    room.status = "playing";
    room.lastActivity = Date.now();
    // Add system chat message
    room.chatMessages.push({ author: "system", text: "Opponent connected. Game on!", ts: Date.now() });
    await this.saveRoom(room);
    return new Response(JSON.stringify({ color: "black", roomId: room.roomId, gameMode: room.gameMode }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  private async handleGetState(): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (!room.stockfishElo) room.stockfishElo = { white: null, black: null };
    if (!room.chatMessages) room.chatMessages = [];
    if (!room.spectatorCount) room.spectatorCount = 0;
    if (!room.gameMode) room.gameMode = "standard";
    if (!room.lastChatAt) room.lastChatAt = { white: 0, black: 0, spectator: 0 };
    // Expire draw offers older than 60 seconds
    if (room.drawOffer && Date.now() - room.drawOffer.offeredAt > 60_000) {
      delete room.drawOffer;
      if (room.status === "draw_offered") room.status = "playing";
      await this.saveRoom(room);
    }
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleMove(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (room.status !== "playing" && room.status !== "draw_offered") {
      return new Response(JSON.stringify({ error: "Game is not active", room }), { status: 400 });
    }

    // Any move cancels a pending draw offer
    if (room.drawOffer) {
      delete room.drawOffer;
      room.status = "playing";
    }

    type MoveBody = {
      move: Move; color: "white" | "black";
      resultFen?: string; algebraic?: string; captured?: string;
      status?: "playing" | "checkmate" | "stalemate" | "draw";
    };
    const body = await request.json<MoveBody>();
    const { move, color } = body;

    room.fenHistory.push(room.fen);
    const chess = new Chess(room.fen);
    let moveResult: ReturnType<typeof chess.move> | null = null;
    try {
      moveResult = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    } catch { moveResult = null; }

    if (moveResult) {
      room.fen = chess.fen();
      room.moveHistory.push(moveResult.san);
      if (moveResult.captured) room.capturedPieces[color].push(moveResult.captured);
      room.turn = chess.turn() === "w" ? "white" : "black";
      if (chess.isCheckmate()) { room.status = "checkmate"; room.winner = color; }
      else if (chess.isStalemate()) { room.status = "stalemate"; }
      else if (chess.isDraw()) { room.status = "draw"; }
    } else if (body.resultFen) {
      room.fen = body.resultFen;
      if (body.algebraic) room.moveHistory.push(body.algebraic);
      if (body.captured) room.capturedPieces[color].push(body.captured);
      const fenTurn = body.resultFen.split(" ")[1];
      room.turn = fenTurn === "w" ? "white" : "black";
      if (body.status && body.status !== "playing") {
        room.status = body.status;
        if (body.status === "checkmate") room.winner = color;
      }
    } else {
      room.fenHistory.pop();
      return cors(new Response(JSON.stringify({ error: "Invalid move", room }), { status: 400 }));
    }

    room.moveCount += 1;
    room.activeEffects = room.activeEffects
      .map(e => e.color === color ? { ...e, turnsRemaining: e.turnsRemaining - 1 } : e)
      .filter(e => e.turnsRemaining > 0);

    if (!room.stockfishElo) room.stockfishElo = { white: null, black: null };
    if (room.stockfishElo[color] !== null) {
      room.stockfishElo[color] = Math.max(600, (room.stockfishElo[color] as number) - 100);
    }

    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleEffect(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (!room.stockfishElo) room.stockfishElo = { white: null, black: null };

    const body = await request.json<{
      effect: Effect; color: "white" | "black"; resultFen?: string; spinInterval: number;
    }>();
    const { effect, color, resultFen, spinInterval } = body;

    if (resultFen) {
      room.fenHistory.push(room.fen);
      room.fen = resultFen;
      room.turn = resultFen.split(" ")[1] === "w" ? "white" : "black";
    }

    const timedEffects: Record<string, { turns: number; targetColor: "white" | "black" }> = {
      shield_piece:    { turns: 2, targetColor: color },
      freeze_piece:    { turns: 2, targetColor: color === "white" ? "black" : "white" },
      downgrade_queen: { turns: 3, targetColor: color === "white" ? "black" : "white" },
      skip_turn:       { turns: 1, targetColor: color === "white" ? "black" : "white" },
      block_nerf:      { turns: 1, targetColor: color },
      force_pawn:      { turns: 1, targetColor: color === "white" ? "black" : "white" },
      no_backward:     { turns: 3, targetColor: color === "white" ? "black" : "white" },
    };

    if (timedEffects[effect.type]) {
      const { turns, targetColor } = timedEffects[effect.type];
      room.activeEffects.push({ color: targetColor, type: effect.type, turnsRemaining: turns, params: effect.params });
    }
    if (effect.type === "delay_spin") room.spinEligibility[color === "white" ? "black" : "white"] += 5;
    if (effect.type === "stockfish_advisor") room.stockfishElo[color] = 2500;

    room.spinEligibility[color] = room.moveCount + (spinInterval ?? DEFAULT_SPIN_INTERVAL);
    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleSyncFen(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    const body = await request.json<{ fen: string }>();
    if (!body.fen) return new Response(JSON.stringify({ error: "fen required" }), { status: 400 });
    try {
      const chess = new Chess(body.fen);
      room.fenHistory.push(room.fen);
      room.fen = chess.fen();
      room.turn = room.fen.split(" ")[1] === "w" ? "white" : "black";
    } catch {
      return new Response(JSON.stringify({ error: "Invalid FEN" }), { status: 400 });
    }
    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleResign(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (room.status !== "playing" && room.status !== "draw_offered") {
      return new Response(JSON.stringify(room), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const body = await request.json<{ color: "white" | "black" }>();
    room.status = "resigned";
    room.winner = body.color === "white" ? "black" : "white";
    const winnerName = room.winner === "white" ? "White" : "Black";
    room.chatMessages.push({ author: "system", text: `${body.color === "white" ? "White" : "Black"} resigned. ${winnerName} wins!`, ts: Date.now() });
    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleDraw(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

    const body = await request.json<{ color: "white" | "black"; action: "offer" | "accept" | "decline" }>();
    const { color, action } = body;

    if (action === "offer") {
      if (room.drawOffer && room.drawOffer.from !== color) {
        // Opponent already offered — auto-accept
        room.status = "draw";
        delete room.drawOffer;
        room.chatMessages.push({ author: "system", text: "Draw agreed by both players.", ts: Date.now() });
      } else {
        room.drawOffer = { from: color, offeredAt: Date.now() };
        room.status = "draw_offered";
        const name = color === "white" ? "White" : "Black";
        room.chatMessages.push({ author: "system", text: `${name} offers a draw.`, ts: Date.now() });
      }
    } else if (action === "accept") {
      if (room.drawOffer) {
        room.status = "draw";
        delete room.drawOffer;
        room.chatMessages.push({ author: "system", text: "Draw agreed by both players.", ts: Date.now() });
      }
    } else if (action === "decline") {
      if (room.drawOffer) {
        const name = color === "white" ? "White" : "Black";
        room.chatMessages.push({ author: "system", text: `${name} declined the draw offer.`, ts: Date.now() });
        delete room.drawOffer;
        room.status = "playing";
      }
    }

    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify(room), { headers: { "Content-Type": "application/json" } });
  }

  private async handleChat(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (!room.chatMessages) room.chatMessages = [];
    if (!room.lastChatAt) room.lastChatAt = { white: 0, black: 0, spectator: 0 };

    const body = await request.json<{ author: "white" | "black" | "spectator"; text: string }>();
    const { author, text } = body;

    // Slowmode
    const now = Date.now();
    const lastAt = room.lastChatAt[author] ?? 0;
    if (now - lastAt < CHAT_SLOWMODE_MS) {
      const waitMs = CHAT_SLOWMODE_MS - (now - lastAt);
      return cors(new Response(JSON.stringify({ error: `Slow down! Wait ${Math.ceil(waitMs / 1000)}s` }), { status: 429 }));
    }

    const filtered = filterChat(text.slice(0, 200).trim());
    if (!filtered) return cors(new Response(JSON.stringify({ error: "Empty message" }), { status: 400 }));

    room.chatMessages.push({ author, text: filtered, ts: now });
    room.lastChatAt[author] = now;
    // Keep last MAX_CHAT_MESSAGES
    if (room.chatMessages.length > MAX_CHAT_MESSAGES) room.chatMessages = room.chatMessages.slice(-MAX_CHAT_MESSAGES);

    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  private async handleSpectate(): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    if (!room.spectatorCount) room.spectatorCount = 0;
    room.spectatorCount += 1;
    room.lastActivity = Date.now();
    await this.saveRoom(room);
    return new Response(JSON.stringify({ ok: true, spectatorCount: room.spectatorCount, gameMode: room.gameMode }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleSpectateLeave(): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    room.spectatorCount = Math.max(0, (room.spectatorCount ?? 1) - 1);
    await this.saveRoom(room);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  private async handleDuck(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    let body: { square?: string } = {};
    try { body = await request.json<{ square?: string }>(); } catch { /* ok */ }
    if (body.square) {
      room.duckSquare = body.square;
      room.lastActivity = Date.now();
      await this.saveRoom(room);
    }
    return new Response(JSON.stringify({ ok: true, duckSquare: room.duckSquare }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

function randomRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
