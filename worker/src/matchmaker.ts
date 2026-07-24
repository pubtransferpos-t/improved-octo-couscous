/**
 * Global FIFO matchmaking queue.
 *
 * A single Durable Object serializes joins, which prevents two tabs from
 * both becoming white when they arrive at nearly the same time.
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

const WAITING_TIMEOUT_MS = 45_000;
const MATCHED_TIMEOUT_MS = 10 * 60_000;

export interface MatchmakerEnv {
  GAME_ROOMS: DurableObjectNamespace;
}

export class Matchmaker {
  private state: DurableObjectState;
  private env: MatchmakerEnv;
  private data: QueueData | null = null;

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
      return cors(json({ error: "Not found" }, 404));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return cors(json({ error: message }, 500));
    }
  }

  private async load(): Promise<QueueData> {
    if (!this.data) {
      this.data = (await this.state.storage.get<QueueData>("queue")) ?? {
        waiting: [],
        tickets: {},
      };
    }
    return this.data;
  }

  private async save(): Promise<void> {
    await this.state.storage.put("queue", this.data);
  }

  private async prune(now: number): Promise<void> {
    const data = await this.load();
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
    await this.save();
  }

  private async join(request: Request): Promise<Response> {
    const data = await this.load();
    let body: { spinInterval?: number } = {};
    try {
      body = await request.json<{ spinInterval?: number }>();
    } catch {
      // Defaults are applied when no matchmaking preferences are provided.
    }
    const now = Date.now();
    const ticket = randomTicket();

    const waitingTicket = data.waiting.shift();
    if (!waitingTicket) {
      data.tickets[ticket] = {
        ticket,
        joinedAt: now,
        lastSeen: now,
        spinInterval: clampSpinInterval(body.spinInterval),
        status: "waiting",
      };
      data.waiting.push(ticket);
      await this.save();
      return json({
        ticket,
        status: "waiting",
        playersOnline: this.onlineCount(now),
        message: "Waiting for an opponent…",
      }, 201);
    }

    const opponent = data.tickets[waitingTicket];
    if (!opponent) {
      // The queue was pruned between selection and this join. Try this
      // request again through the same serialized object.
      data.waiting.unshift(ticket);
      data.tickets[ticket] = {
        ticket,
        joinedAt: now,
        lastSeen: now,
        spinInterval: clampSpinInterval(body.spinInterval),
        status: "waiting",
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
      ticket,
      joinedAt: now,
      lastSeen: now,
      spinInterval: clampSpinInterval(body.spinInterval),
      status: "matched",
      roomId,
      color: "black",
    };
    await this.save();

    // The second player joins the room after it has been created. The first
    // player receives the same match through their status poll.
    await this.joinRoom(roomId);
    return json({
      ticket,
      status: "matched",
      roomId,
      color: "black",
      playersOnline: 2,
      message: "Opponent found!",
    });
  }

  private async status(ticket: string | null): Promise<Response> {
    if (!ticket) return json({ error: "Ticket is required" }, 400);
    const data = await this.load();
    const entry = data.tickets[ticket];
    if (!entry) return json({ error: "Matchmaking ticket expired" }, 404);

    entry.lastSeen = Date.now();
    await this.save();
    if (entry.status === "waiting") {
      return json({
        ticket,
        status: "waiting",
        playersOnline: this.onlineCount(entry.lastSeen),
        message: "Waiting for an opponent…",
      });
    }
    return json({
      ticket,
      status: "matched",
      roomId: entry.roomId,
      color: entry.color,
      playersOnline: 2,
      message: "Opponent found!",
    });
  }

  private async leave(request: Request): Promise<Response> {
    let body: { ticket?: string } = {};
    try {
      body = await request.json<{ ticket?: string }>();
    } catch {
      // A missing ticket is a harmless no-op.
    }
    if (body.ticket) {
      const data = await this.load();
      delete data.tickets[body.ticket];
      data.waiting = data.waiting.filter((ticket) => ticket !== body.ticket);
      await this.save();
    }
    return json({ ok: true });
  }

  private onlineCount(now: number): number {
    const data = this.data!;
    return Object.values(data.tickets).filter(
      (entry) => now - entry.lastSeen < WAITING_TIMEOUT_MS,
    ).length;
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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