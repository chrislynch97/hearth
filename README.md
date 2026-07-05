# Hearth

Local-first, self-hostable household budgeting app. It runs as a **single Node
process** that serves both the API and the web UI, backed by a **single SQLite
file** — which makes it easy to self-host and trivial to back up (copy one folder).

## What it does

- **Pots & funding plan** — split shared costs into categories/pots and generate a
  per-person funding plan (income-proportional or even).
- **Income** — payslips, deductions, raises; the plan uses your real monthly income.
- **Spending** — log spends against pots, reconcile, split across pots/people.
- **Accounts & net worth** — asset/liability balances over time.
- **Reports** — spend-vs-allocation, fairness, month-over-month; CSV/JSON export.
- **Monzo CSV import** — review-before-commit importer.
- **One shared password** (optional) and **automatic backups**.

## Quick start (development)

```bash
npm install
npm run dev:server   # API on :8787
npm run dev:client   # UI on :5173 (proxies /trpc to the API)
```

- `npm test` — run the test suite
- `npm run typecheck` — type-check the whole project

## Deploy

Two supported ways — see **[docs/deployment.md](docs/deployment.md)** for the full guide.

- **Standalone** (any PC / VM / Raspberry Pi with Docker):
  ```bash
  docker compose up -d      # → http://localhost:8787
  ```
- **Home Assistant OS add-on**: in HA, **Settings → Add-ons → Add-on Store → ⋮ →
  Repositories**, add `https://github.com/chrislynch97/hearth`, then install **Hearth**.

Your entire state lives in one folder (`./data` standalone, the add-on's `/data`
on HA). Back it up by copying it, or via **Settings → Data → Export** in the app.

## Configuration

All configuration is via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `file:./data/app.db` | SQLite location (libsql). Can point at a [Turso](https://turso.tech) URL. |
| `CLIENT_DIR` | `../client` (source) | Where the built UI is served from. **Set to `./dist/client` for a non-Docker production run.** |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that doesn't send `x-forwarded-proto: https`. |

## Tech

TypeScript end-to-end. React + Vite + Mantine (client), Fastify + tRPC (server),
SQLite via libsql + Drizzle ORM. Money is stored as integer minor units;
migrations run automatically on boot.

## License

[FSL-1.1-MIT](LICENSE.md).
