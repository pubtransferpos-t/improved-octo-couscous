# Gambit Chess — Cloudflare Worker Backend

This Worker powers online multiplayer for Gambit. It uses a **Durable Object per game room** to maintain strongly consistent game state. Both players send moves to the Worker; it stores the authoritative state; clients poll every 2 seconds.

## Deployment (browser-only, no local installation needed)

### Prerequisites
1. Create a free Cloudflare account at https://cloudflare.com  
2. Connect your GitHub repo to Cloudflare Workers via the Cloudflare dashboard

### Deploy via Cloudflare Dashboard (no CLI needed)

1. **Push this repo to GitHub** (Replit can push for you — just connect your GitHub account from Replit's sidebar).

2. **Create a Worker:**  
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
   - Choose **"Import a repository"** (connect your GitHub account if prompted)
   - Select this repository, set the **root directory** to `worker/`
   - **Build command:** `npm install` (wrangler deploy runs automatically)
   - **Deploy** — Cloudflare assigns a URL like `https://gambit-chess.<yourname>.workers.dev`

3. **Enable Durable Objects** (free tier, no $5/mo plan needed):  
   - In your Worker's dashboard → **Durable Objects** → it will be pre-configured from `wrangler.toml`

4. **Set the Worker URL in the game:**  
   - Open the game → **Settings** → paste your Worker URL (e.g. `https://gambit-chess.yourname.workers.dev`)
   - The game saves this in localStorage and uses it for all online API calls

### Local development (optional, requires Node.js)

```bash
cd worker
npm install
npm run dev   # starts at http://localhost:8787
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rooms` | Create a game room (host = white). Returns `{ roomId }` |
| POST | `/rooms/:id/join` | Join as guest (= black). Returns `{ color, roomId }` |
| GET | `/rooms/:id/state` | Get current game state (poll every 2s) |
| POST | `/rooms/:id/move` | Submit a move with resulting FEN |
| POST | `/rooms/:id/effect` | Submit a spin result/board effect |
| POST | `/rooms/:id/resign` | Resign the game |

### POST /rooms

Query params (optional):
- `roomId` — custom 6-char room code (generated if omitted)
- `spinInterval` — moves between spins (default: 5)

### POST /rooms/:id/move

Body:
```json
{
  "move": { "from": "e2", "to": "e4", "promotion": "q" },
  "color": "white",
  "resultFen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "algebraic": "e4",
  "captured": "p",
  "status": "playing"
}
```

### POST /rooms/:id/effect

Body:
```json
{
  "effect": { "type": "freeze", "params": { "square": "d5" } },
  "color": "white",
  "resultFen": "...",
  "spinInterval": 5
}
```

Effect types: `extra_turn`, `shield`, `revive`, `instant_promote`, `swap_pieces`, `block_nerf`, `undo_move`, `bonus_spin`, `skip_turn`, `freeze`, `lose_pawn`, `queen_downgrade`, `delay_spin`, `force_pawn`, `shuffle_pieces`

## Architecture

- Each game room is a **Durable Object** — a single-threaded, strongly consistent compute unit with its own persistent storage
- The Worker routes incoming requests to the correct room by room code
- State persists in Durable Object storage (key-value)
- Move validation runs on the client (chess.js) — the Worker stores the resulting FEN the client sends
- All CORS headers are set to `*` so the frontend can call from any origin
