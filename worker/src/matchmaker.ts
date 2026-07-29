/**
 * Global FIFO matchmaking queue + public lobby room registry.
 */

interface QueueEntry {
  ticket: string;
  joinedAt: number;
  lastSeen: number;
  spinInterval: number;
  status: "waiting" | "matched";
  roomId?: string;
  color?: "white" | "black";
}

interface QueueData {
  waiting: string[];
  tickets: Record<string, QueueEntry>;
}

export interface LobbyRoom {
  roomId: string;
  gameMode: string;
  status: "waiting" | "playing";
  createdAt: number;
  spectatorCount: number;
  spinInterval?: number;
  title?: string;
  description?: string;
}

interface LobbyData {
  rooms: Record<string, LobbyRoom>;
}

const WAITING_TIMEOUT_MS = 45_000;
const MATCHED_TIMEOUT_MS = 10 * 60_000;
const LOBBY_ROOM_TTL_MS = 60 * 60_000; // 1 hour

export interface MatchmakerEnv {
  GAME_ROOMS: DurableObjectNamespace;
}

export class Matchmaker {
  private state: DurableObjectState;
  private env: MatchmakerEnv;
  private data: QueueData | null = null;
  private lobbyData: LobbyData | null = null;

  constructor(state: DurableObjectState, env: MatchmakerEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      await this.load();
      await this.prune(Date.now());

      if (request.method === "POST" && url.pathname.endsWith("/join")) {
        return cors(await this.join(request));
      }
      if (request.method === "GET" && url.pathname.endsWith("/status")) {
        return cors(await this.status(url.searchParams.get("ticket")));
      }
      if (request.method === "POST" && url.pathname.endsWith("/leave")) {
        return cors(await this.leave(request));
      }
      // Lobby routes
      if (request.method === "POST" && url.pathname.endsWith("/lobby/register")) {
        return cors(await this.lobbyRegister(request));
      }
      if (request.method === "POST" && url.pathname.endsWith("/lobby/unregister")) {
        return cors(await this.lobbyUnregister(request));
      }
      if (request.method === "GET" && url.pathname.endsWith("/lobby/rooms")) {
        return cors(await this.lobbyList());
      }
      if (request.method === "POST" && url.pathname.endsWith("/lobby/update")) {
        return cors(await this.lobbyUpdate(request));
      }
      return cors(json({ error: "Not found" }, 404));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return cors(json({ error: message }, 500));
    }
  }

  private async load(): Promise<void> {
    if (!this.data) {
      this.data = (await this.state.storage.get<QueueData>("queue")) ?? { waiting: [], tickets: {} };
    }
    if (!this.lobbyData) {
      this.lobbyData = (await this.state.storage.get<LobbyData>("lobby")) ?? { rooms: {} };
    }
  }

  private async save(): Promise<void> {
    await this.state.storage.put("queue", this.data);
    await this.state.storage.put("lobby", this.lobbyData);
  }

  private async prune(now: number): Promise<void> {
    const data = this.data!;
    const lobby = this.lobbyData!;
    const activeCutoff = now - WAITING_TIMEOUT_MS;
    const matchedCutoff = now - MATCHED_TIMEOUT_MS;

    data.waiting = data.waiting.filter((ticket) => {
      const entry = data.tickets[ticket];
      if (!entry || entry.status !== "waiting" || entry.lastSeen < activeCutoff) {
        if (entry) delete data.tickets[ticket];
        return false;
      }
      return true;
    });

    for (const [ticket, entry] of Object.entries(data.tickets)) {
      if (entry.status === "matched" && entry.lastSeen < matchedCutoff) {
        delete data.tickets[ticket];
      }
    }

    // Prune old lobby rooms
    for (const [roomId, room] of Object.entries(lobby.rooms)) {
      if (now - room.createdAt > LOBBY_ROOM_TTL_MS) {
        delete lobby.rooms[roomId];
      }
    }

    await this.save();
  }

  private async join(request: Request): Promise<Response> {
    const data = this.data!;
    let body: { spinInterval?: number } = {};
    try { body = await request.json<{ spinInterval?: number }>(); } catch { /* ok */ }
    const now = Date.now();
    const ticket = randomTicket();

    const waitingTicket = data.waiting.shift();
    if (!waitingTicket) {
      data.tickets[ticket] = {
        ticket, joinedAt: now, lastSeen: now,
        spinInterval: clampSpinInterval(body.spinInterval), status: "waiting",
      };
      data.waiting.push(ticket);
      await this.save();
      return json({ ticket, status: "waiting", playersOnline: this.onlineCount(now), message: "Waiting for an opponent…" }, 201);
    }

    const opponent = data.tickets[waitingTicket];
    if (!opponent) {
      data.waiting.unshift(ticket);
      data.tickets[ticket] = {
        ticket, joinedAt: now, lastSeen: now,
        spinInterval: clampSpinInterval(body.spinInterval), status: "waiting",
      };
      await this.save();
      return json({ ticket, status: "waiting", playersOnline: this.onlineCount(now) }, 201);
    }

    const roomId = randomRoomId();
    await this.createRoom(roomId, Math.max(opponent.spinInterval, clampSpinInterval(body.spinInterval)));

    opponent.status = "matched";
    opponent.roomId = roomId;
    opponent.color = "white";
    opponent.lastSeen = now;
    data.tickets[ticket] = {
      ticket, joinedAt: now, lastSeen: now,
      spinInterval: clampSpinInterval(body.spinInterval),
      status: "matched", roomId, color: "black",
    };
    await this.save();
    await this.joinRoom(roomId);
    return json({ ticket, status: "matched", roomId, color: "black", playersOnline: 2, message: "Opponent found!" });
  }

  private async status(ticket: string | null): Promise<Response> {
    if (!ticket) return json({ error: "Ticket is required" }, 400);
    const data = this.data!;
    const entry = data.tickets[ticket];
    if (!entry) return json({ error: "Matchmaking ticket expired" }, 404);
    entry.lastSeen = Date.now();
    await this.save();
    if (entry.status === "waiting") {
      return json({ ticket, status: "waiting", playersOnline: this.onlineCount(entry.lastSeen), message: "Waiting for an opponent…" });
    }
    return json({ ticket, status: "matched", roomId: entry.roomId, color: entry.color, playersOnline: 2, message: "Opponent found!" });
  }

  private async leave(request: Request): Promise<Response> {
    let body: { ticket?: string } = {};
    try { body = await request.json<{ ticket?: string }>(); } catch { /* ok */ }
    if (body.ticket) {
      const data = this.data!;
      delete data.tickets[body.ticket];
      data.waiting = data.waiting.filter((t) => t !== body.ticket);
      await this.save();
    }
    return json({ ok: true });
  }

  private async lobbyRegister(request: Request): Promise<Response> {
    const lobby = this.lobbyData!;
    const body = await request.json<{
      roomId: string; gameMode: string; spinInterval?: number; title?: string; description?: string;
    }>();
    lobby.rooms[body.roomId] = {
      roomId: body.roomId,
      gameMode: body.gameMode ?? "standard",
      status: "waiting",
      createdAt: Date.now(),
      spectatorCount: 0,
      spinInterval: body.spinInterval,
      title: body.title?.slice(0, 60),
      description: body.description?.slice(0, 200),
    };
    await this.save();
    return json({ ok: true });
  }

  private async lobbyUnregister(request: Request): Promise<Response> {
    const lobby = this.lobbyData!;
    const body = await request.json<{ roomId: string }>();
    delete lobby.rooms[body.roomId];
    await this.save();
    return json({ ok: true });
  }

  private async lobbyUpdate(request: Request): Promise<Response> {
    const lobby = this.lobbyData!;
    const body = await request.json<{ roomId: string; status?: "waiting" | "playing"; spectatorCount?: number }>();
    const room = lobby.rooms[body.roomId];
    if (room) {
      if (body.status !== undefined) room.status = body.status;
      if (body.spectatorCount !== undefined) room.spectatorCount = body.spectatorCount;
      await this.save();
    }
    return json({ ok: true });
  }

  private async lobbyList(): Promise<Response> {
    const lobby = this.lobbyData!;
    const rooms = Object.values(lobby.rooms).sort((a, b) => b.createdAt - a.createdAt);
    return json({ rooms });
  }

  private onlineCount(now: number): number {
    return Object.values(this.data!.tickets).filter(e => now - e.lastSeen < WAITING_TIMEOUT_MS).length;
  }

  private async createRoom(roomId: string, spinInterval: number): Promise<void> {
    const id = this.env.GAME_ROOMS.idFromName(roomId);
    const stub = this.env.GAME_ROOMS.get(id);
    const url = new URL(`/rooms/${roomId}?roomId=${roomId}&spinInterval=${spinInterval}`, "https://matchmaker.internal");
    const response = await stub.fetch(new Request(url, { method: "POST" }));
    if (!response.ok) throw new Error("Could not create a game room");
  }

  private async joinRoom(roomId: string): Promise<void> {
    const id = this.env.GAME_ROOMS.idFromName(roomId);
    const stub = this.env.GAME_ROOMS.get(id);
    const response = await stub.fetch(new Request(
      new URL(`/rooms/${roomId}/join`, "https://matchmaker.internal"),
      { method: "POST" },
    ));
    if (!response.ok) throw new Error("Could not join the matched game room");
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

function clampSpinInterval(value: number | undefined): number {
  return Math.min(10, Math.max(3, Number.isFinite(value) ? Number(value) : 5));
}

function randomTicket(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
