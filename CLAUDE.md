# Hearth — notes for Claude

## Working from a GitHub issue link

When I send a GitHub issue link, follow this workflow:

1. Create a git worktree + branch for it, named to match the issue: the issue
   number followed by a short kebab-case slug of the title (e.g. issue #65
   "keep the selected date…" ⇒ `65-keep-spend-date`).
2. Do the work on that branch.
3. Open a PR into `main` for me to review — reference the issue in the PR body
   (e.g. `Closes #65`).

## Running / testing the app: use DEMO MODE, never real data

This is a real household's live budgeting app. The database is **Postgres**
(see [issue #25](https://github.com/chrislynch97/hearth/issues/25)). `DATABASE_URL`
selects the engine: unset ⇒ embedded PGlite (Postgres-in-WASM) at `./data/pgdata`
(the self-host default); `postgres://…` ⇒ a real Postgres server. That real
database holds the owner's live financial data — **never run, seed, wipe, or
point verification at it.**

When you need to start the app to test a change, verify a fix, or take a
screenshot, use **demo mode** — it runs against a separate, disposable PGlite
database (`./data/demo`) full of deterministic fake data, so the real database is
never touched:

```bash
npm run demo         # seeds ./data/demo on first run, then serves on :8787
npm run dev:client   # UI on :5173 (proxies /trpc to :8787), in another terminal
```

- `npm run demo -- --seed` — force a fresh re-seed before serving.
- `npm run demo:seed` — regenerate the demo data without starting the server.

The demo dataset generator is [`src/server/db/demo.ts`](src/server/db/demo.ts)
(edit it to change what the demo shows). The seed script refuses to write to a
database that looks like the real one — the `pgdata` dir, a legacy `app.db`, or
any `postgres://` URL (override only with `--force`, and don't). See the "Demo
mode" section of the [README](README.md) for details.

Only use `npm run dev:server` (which serves the real database) if the task is
explicitly about the owner's real data and they've asked for it.

Tests run against ephemeral in-memory PGlite (`src/server/db/testdb.ts`), so
`npm test` exercises the real engine and needs no running Postgres. A legacy
SQLite `app.db` migrates across with `npm run db:migrate-from-sqlite -- <path>`.
