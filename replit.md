# Gambit – Gamble Chess

A chess variant where every N moves each player may spin a wheel to grant themselves a random buff or inflict a random nerf on their opponent. Supports quick play vs bot, local pass-and-play, custom matches, and online multiplayer.

## Run & Operate

- Gambit frontend: `artifacts/gambit: web` workflow (auto-starts)
- API server: `API Server` workflow (auto-starts, port 3001)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)
- Required env: `SESSION_SECRET` — session signing secret (set as a Replit Secret)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS 4, Radix UI, Framer Motion, chess.js, Stockfish 18, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Real-time multiplayer: Cloudflare Workers + Durable Objects (deployed separately to Cloudflare)

## Where things live

- `artifacts/gambit/` — React frontend (chess game UI)
- `artifacts/api-server/` — Express API backend (auth, data persistence)
- `worker/` — Cloudflare Worker for real-time online multiplayer (Durable Object per game room)
- `lib/db/` — Drizzle ORM schema (source of truth for DB)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-zod/` — Generated Zod schemas from OpenAPI spec
- `lib/api-client-react/` — Generated React Query hooks

## Architecture decisions

- Online multiplayer uses Cloudflare Durable Objects (one per game room) for strongly consistent state; clients poll every 2 seconds
- Move validation runs on the client (chess.js) — the Worker stores the resulting FEN sent by the client
- Buff/nerf effects are applied by directly manipulating board state, with safety checks to prevent illegal king positions
- Bot uses Stockfish 18 via Web Worker with configurable depth for difficulty
- Worker URL is configurable by the user in-game via Settings → paste Worker URL (stored in localStorage)

## Product

Gamble Chess with four modes: quick play vs bot, local pass-and-play, fully custom matches (configurable rules/buff pool/turn interval), and online multiplayer. Spins occur every N moves; effects include buffs (extra turn, shield, revive, instant-promote, swap pieces, block nerf, undo move, bonus spin) and nerfs (skip turn, freeze, lose pawn, downgrade queen, delay spin, force pawn advance, shuffle pieces).

## Online Multiplayer Setup (Cloudflare)

The Worker must be deployed separately to Cloudflare. Steps (all browser-based, no local installs):
1. Push this repo to GitHub (Replit can do this from the sidebar)
2. In Cloudflare dashboard → Workers & Pages → Create → Import a repository → select this repo, root dir = `worker/`
3. The deployed Worker URL (e.g. `https://gambit-chess.yourname.workers.dev`) is pasted into the game's Settings page by the user

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `DATABASE_URL` is runtime-managed by Replit — do not set it manually
- The `worker/` directory has its own `node_modules` and `package.json` separate from the monorepo (Cloudflare-specific)
- After any API schema change, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks and Zod schemas
- `stockfish` must be listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml` so its postinstall script runs
- The API server workflow uses `PORT=3001` explicitly; it is NOT yet registered as a Replit artifact so `/api` is not proxy-routed
- gambit frontend is at `artifacts/gambit/` (registered artifact, port 22001, preview path `/`)
- api-server is at `artifacts/api-server/` (workflow only, port 3001, no proxy routing yet)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `worker/README.md` for Cloudflare Worker deployment instructions
