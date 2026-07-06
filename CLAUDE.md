# Hearth — notes for Claude

## Running / testing the app: use DEMO MODE, never real data

This is a real household's live budgeting app. The production database
(`./data/app.db`, selected by `DATABASE_URL`) holds the owner's real financial
data. **Never run, seed, wipe, or point verification at the real database.**

When you need to start the app to test a change, verify a fix, or take a
screenshot, use **demo mode** — it runs against a separate, disposable database
(`./data/demo.db`) full of deterministic fake data, so the real `app.db` is never
touched:

```bash
npm run demo         # seeds ./data/demo.db on first run, then serves on :8787
npm run dev:client   # UI on :5173 (proxies /trpc to :8787), in another terminal
```

- `npm run demo -- --seed` — force a fresh re-seed before serving.
- `npm run demo:seed` — regenerate the demo data without starting the server.

The demo dataset generator is [`src/server/db/demo.ts`](src/server/db/demo.ts)
(edit it to change what the demo shows). The seed script refuses to write to a
database that looks like the real `app.db` (override only with `--force`, and
don't). See the "Demo mode" section of the [README](README.md) for details.

Only use `npm run dev:server` (which serves the real `app.db`) if the task is
explicitly about the owner's real data and they've asked for it.
