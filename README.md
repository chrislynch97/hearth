# Hearth

Local-first, self-hostable household budgeting app.

## Develop

- `npm install`
- In two terminals: `npm run dev:server` (API on :8787) and `npm run dev:client` (UI on :5173).
  The Vite dev server proxies `/trpc` to the API.
- `npm test` — run the test suite.
- `npm run typecheck` — type-check the whole project.

## Run (Docker)

- `docker compose up -d`
- Open http://localhost:8787
- Data lives in `./data/app.db` — back it up by copying that folder.

## Tech

TypeScript end-to-end. React + Vite + Mantine (client), Fastify + tRPC (server),
SQLite via libsql + Drizzle ORM. Money is stored as integer minor units; migrations
run automatically on boot.

## Status

Phase 1 (foundation) complete: toolchain, shared money/recurrence utilities, the
`household` + `member` schema with migrations and seed, the `health` / `bootstrap.context`
API, and a Mantine app shell with a setup gate and light/dark toggle.
