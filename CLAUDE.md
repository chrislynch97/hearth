# Hearth — notes for Claude

## Where issues live

Two trackers, deliberately:

- **`chrislynch97/hearth`** (public) — issues raised by other people. Keep it
  clean; don't file my own planning or operator tasks here.
- **`chrislynch97/hearth-planning`** (private) — my backlog: feature work, the
  go-live runbook, anything that's a task for me rather than a report from
  someone else. File new work here by default.

## Working from a GitHub issue link

When I send a GitHub issue link, follow this workflow:

1. Create a git worktree + branch for it, named to match the issue: the issue
   number followed by a short kebab-case slug of the title (e.g. issue #65
   "keep the selected date…" ⇒ `65-keep-spend-date`).
2. Do the work on that branch.
3. Open a PR into `main` for me to review — reference the issue in the PR body.
   For a `hearth` issue that's `Closes #65`. For a planning issue use the full
   `Closes chrislynch97/hearth-planning#13` — **GitHub won't auto-close across
   repos**, so say in the PR that the issue needs closing by hand, and close it
   once the PR merges.

## Running / testing the app: fake data only, never the real database

This is a real household's live budgeting app. The database is **Postgres**
(see [issue #25](https://github.com/chrislynch97/hearth/issues/25)). `DATABASE_URL`
selects the engine: unset ⇒ embedded PGlite (Postgres-in-WASM) at `./data/pgdata`
(the self-host default); `postgres://…` ⇒ a real Postgres server. The owner's
live data is the **production** instance (Docker + Postgres, off this checkout) —
**never run, seed, wipe, or point verification at it.**

Nothing in this repo opens it. Both run modes pin `DATABASE_URL` to a disposable
PGlite folder of their own and refuse anything that looks like the real database:

```bash
npm run dev:server   # ./data/dev — three fake households, logins. Everyday work.
npm run demo         # ./data/demo — one open household, no login. Demos + e2e.
npm run dev:client   # UI on :5173 (proxies /trpc to :8787), in another terminal
```

Dev mode is **locked**: log in as `ava` / `hearth-dev` (every seeded account
shares that password). Demo mode needs no login, so prefer it for a screenshot
and dev mode for anything touching households, roles, invites or auth.

- `npm run dev:server -- --seed` / `npm run demo -- --seed` — fresh re-seed first.
- `npm run dev:seed` / `npm run demo:seed` — re-seed without starting the server.

The generator is [`src/server/db/demo.ts`](src/server/db/demo.ts); the dev
households it builds are defined in [`src/server/db/dev.ts`](src/server/db/dev.ts).
Both seed scripts refuse to write to a database that looks like the real one — the
`pgdata` dir, a legacy `app.db`, or any `postgres://` URL (override only with
`--force`, and don't). See the README for details.

`npm start` is the only command that serves whatever `DATABASE_URL` points at.
Don't run it here.

Tests run against ephemeral in-memory PGlite (`src/server/db/testdb.ts`), so
`npm test` exercises the real engine and needs no running Postgres. A legacy
SQLite `app.db` migrates across with `npm run db:migrate-from-sqlite -- <path>`.
