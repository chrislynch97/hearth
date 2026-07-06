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
- **Shared password with optional two-factor (TOTP)** and **automatic backups**.

## Quick start (development)

```bash
npm install
npm run dev:server   # API on :8787
npm run dev:client   # UI on :5173 (proxies /trpc to the API)
```

- `npm test` — run the test suite
- `npm run typecheck` — type-check the whole project

## Demo mode

For development against fake data (so you never work over your real household) and
for showing the app to other people, seed a **separate** demo database. It lives in
its own file (`./data/demo.db`) — your real `app.db` is never touched.

```bash
npm run demo         # seed ./data/demo.db (first run) + serve it on :8787
npm run dev:client   # UI on :5173, in another terminal
```

- `npm run demo -- --seed` — force a fresh re-seed before serving.
- `npm run demo:seed` — just (re)generate the demo data, without starting the server.

**Or via Docker** (serves the built UI too, so it's a single command on :8787 — no
separate dev client):

```bash
docker compose -f docker-compose.demo.yml up --build   # → http://localhost:8787
```

This runs against `./data/demo.db`, so your real `app.db` is untouched. Force a
fresh re-seed with:

```bash
docker compose -f docker-compose.demo.yml run --rm --service-ports \
  hearth-demo node --import tsx scripts/demo-server.ts --seed
```

The dataset is a coherent, fictional household ("Maple Street" — two people plus a
joint entity): categories, pots and recurring bills; months of spending with a live
catch-up backlog, refunds, a split, imported rows and reconciled batches; a year-plus
of payslips with a raise and a bonus month; and asset/liability balances trending
toward a rising net worth. It's **deterministic** (a fixed seed) and **anchored to the
current month**, so re-runs are identical and the trend charts always look current.
The generator lives in [`src/server/db/demo.ts`](src/server/db/demo.ts); tweak it to
change what the demo shows. The seed script refuses to write to a database that looks
like your real `app.db` (pass `--force` to override).

## Deploy

See **[docs/deployment.md](docs/deployment.md)** for the full guide.

- **Docker** (any PC / VM / Raspberry Pi):
  ```bash
  docker compose up -d      # → http://localhost:8787
  ```
- **Node directly** (no Docker) — see the deployment guide.

Your entire state lives in one folder (`./data`, bind-mounted to `/data` in the
container). Back it up by copying it, or via **Settings → Data → Export** in the app.

## Configuration

All configuration is via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `file:./data/app.db` | SQLite location (libsql). Can point at a [Turso](https://turso.tech) URL. |
| `CLIENT_DIR` | `../client` (source) | Where the built UI is served from. **Set to `./dist/client` for a non-Docker production run.** |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that doesn't send `x-forwarded-proto: https`. |
| `HEARTH_TRUST_PROXY` | unset | Set to `1` **only when behind a reverse proxy / tunnel** so the login rate limiter keys on the real client IP (`X-Forwarded-For`). Leave unset when directly exposed, or clients could spoof that header. |

## Security

An optional **shared household password** (**Settings → Security**) gates the whole
app; passwords must be at least 10 characters. On top of it you can enable
**two-factor authentication** (TOTP — Google Authenticator, 1Password, Aegis…) with
one-time recovery codes. With no password set, the instance is open — fine on a
trusted LAN, not for public exposure. See
[docs/deployment.md](docs/deployment.md#https--security).

## Tech

TypeScript end-to-end. React + Vite + Mantine (client), Fastify + tRPC (server),
SQLite via libsql + Drizzle ORM. Money is stored as integer minor units;
migrations run automatically on boot.

## License

[FSL-1.1-MIT](LICENSE.md).
