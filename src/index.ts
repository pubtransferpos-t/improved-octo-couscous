/**
 * Gambit – Gamble Chess: Cloudflare Worker entry point
 *
 * Routes:
 *   POST   /rooms                  → Create a game room (host = white)
 *   POST   /rooms/:id/join         → Join as guest (= black)
 *   GET    /rooms/:id/state        → Poll game state
 *   POST   /rooms/:id/move         → Submit a move
 *   POST   /rooms/:id/effect       → Submit a spin effect
 *   POST   /rooms/:id/resign       → Resign
 */

import { GameRoom } from "./game-room";

export { GameRoom };

export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight globally
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Route: /rooms
    const roomsMatch = url.pathname.match(/^\/rooms(?:\/([A-Z0-9]{4,10}))?(?:\/(.+))?$/i);

    if (!roomsMatch) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const roomId = roomsMatch[1];
    const action = roomsMatch[2] ?? "";

    // POST /rooms — create a room (no roomId in URL yet)
    if (request.method === "POST" && !roomId) {
      const queryRoomId = url.searchParams.get("roomId") ?? generateRoomId();
      const doId = env.GAME_ROOMS.idFromName(queryRoomId);
      const stub = env.GAME_ROOMS.get(doId);
      const doUrl = new URL(request.url);
      doUrl.searchParams.set("roomId", queryRoomId);
      return stub.fetch(new Request(doUrl.toString(), {
        method: "POST",
        headers: request.headers,
        body: request.body,
      }));
    }

    // All other routes require a roomId
    if (!roomId) {
      return jsonResponse({ error: "Room ID required" }, 400);
    }

    const doId = env.GAME_ROOMS.idFromName(roomId.toUpperCase());
    const stub = env.GAME_ROOMS.get(doId);

    // Forward to the Durable Object
    const doUrl = new URL(request.url);
    return stub.fetch(new Request(doUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }));
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
