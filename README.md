# Hearth

Local-first, self-hostable household budgeting app. It runs as a **single Node
process** that serves both the API and the web UI, backed by **Postgres** — either
an embedded, zero-config [PGlite](https://pglite.dev) database in a local folder
(the default: easy to self-host, trivial to back up by copying `./data`) or a real
Postgres server you point it at (for a hosted / multi-instance deployment).

## What it does

- **Pots & funding plan** — split shared costs into categories/pots and generate a
  per-person funding plan (income-proportional or even).
- **Income** — payslips, deductions, raises; the plan uses your real monthly income.
- **Spending** — log spends against pots, reconcile, split across pots/people.
- **Accounts & net worth** — asset/liability balances over time.
- **Reports** — spend-vs-allocation, fairness, month-over-month; CSV/JSON export.
- **Monzo CSV import** — review-before-commit importer.
- **User accounts** — per-user login with roles, invite links, optional two-factor
  (TOTP), and **automatic backups**. Supports **multiple households** (a switcher
  in the account menu), mapping an account to a budgeting member, and optional
  self-service **sign-up**.

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
its own PGlite folder (`./data/demo`) — your real database is never touched.

```bash
npm run demo         # seed ./data/demo (first run) + serve it on :8787
npm run dev:client   # UI on :5173, in another terminal
```

- `npm run demo -- --seed` — force a fresh re-seed before serving.
- `npm run demo:seed` — just (re)generate the demo data, without starting the server.

**Or via Docker** (serves the built UI too, so it's a single command on :8787 — no
separate dev client):

```bash
docker compose -f docker-compose.demo.yml up --build   # → http://localhost:8787
```

This runs against `./data/demo`, so your real database is untouched. Force a
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
like your real one — the `pgdata` folder, a legacy `app.db`, or any `postgres://` URL
(pass `--force` to override).

## Deploy

See **[docs/deployment.md](docs/deployment.md)** for the full guide.

- **Docker** (any PC / VM / Raspberry Pi):
  ```bash
  docker compose up -d      # → http://localhost:8787  (passwords on — the safe default)
  ```
  To run **password-less on a trusted home LAN**, set the env var at launch (no
  file edits needed):
  ```bash
  HEARTH_ALLOW_OPEN=1 docker compose up -d
  # PowerShell:  $env:HEARTH_ALLOW_OPEN=1; docker compose up -d
  # Plain docker run:  docker run -e HEARTH_ALLOW_OPEN=1 ...
  ```
  Leave it unset for anything reachable from the internet, and set an owner
  password instead.
- **Node directly** (no Docker) — see the deployment guide.

Your entire state lives in one folder (`./data`, bind-mounted to `/data` in the
container). Back it up by copying it, or via **Settings → Data → Export** in the app.

## Configuration

All configuration is via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `HOST` | `0.0.0.0` | Address to bind. Set to `127.0.0.1` to only accept connections from the same machine (e.g. when a reverse proxy sits in front). |
| `DATABASE_URL` | `pglite:./data/pgdata` | Database. Unset (or `pglite:<dir>`) uses the embedded PGlite database in that folder; `postgres://user:pass@host/db` (or `postgresql://…`) connects to a real Postgres server — use that for a hosted or multi-instance deployment. |
| `CLIENT_DIR` | `../client` (source) | Where the built UI is served from. **Set to `./dist/client` for a non-Docker production run.** |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that doesn't send `x-forwarded-proto: https`. |
| `HEARTH_TRUST_PROXY` | unset | Set to the **number of proxy hops** in front of Hearth (a single reverse proxy / tunnel = `1`) so the login rate limiter keys on the real client IP (`X-Forwarded-For`). Leave unset when directly exposed. Do **not** set it to `true`/all — trusting the whole `X-Forwarded-For` chain lets a client spoof the header and dodge the limiter. Your proxy must **overwrite** (not append to) `X-Forwarded-For`. Accepts a hop count, or a comma-separated list of trusted proxy IPs/CIDRs. |
| `HEARTH_ALLOW_OPEN` | unset | Set to `1` to allow running **open** (no owner password) while bound to a non-loopback address. Without it, an open instance on `0.0.0.0` serves only the login/first-run endpoints and refuses budgeting data — so a public deploy can't accidentally hand anonymous callers full owner access. Set an owner password instead of using this in production. |
| `HEARTH_ALLOWED_ORIGINS` | unset | Extra origins allowed to make state-changing requests, comma-separated (`https://hearth.example.com`). Writes must come from the same origin the app is served on; you only need this if a proxy in front rewrites the `Host` header so it no longer matches the address the browser actually used. Requests without an `Origin` header (curl, scripts, health checks) are unaffected. |

## Security

Hearth has **per-user accounts**. A fresh install auto-creates an **owner** account
with no password. To guard against an accidental public deploy, an open
(password-less) instance bound to a non-loopback address (e.g. `0.0.0.0`) refuses
to serve budgeting data by default — so exposing it to the internet can't silently
hand anonymous callers full owner access. Two ways forward:

- **Set an owner password** (recommended for anything reachable beyond your home
  LAN) — **Settings → Security**, at least 10 characters. This locks the instance
  and turns login on.
- **Run password-less on a trusted home LAN** by opting in with
  `HEARTH_ALLOW_OPEN=1`. This is safe on a home network behind a router, not on a
  public host. It's wired up for you in the two common local setups:
  - **Local development** — `npm run dev:server` sets it automatically.
  - **Local Docker** — launch with `HEARTH_ALLOW_OPEN=1 docker compose up -d`
    (see [Deploy](#deploy)); no file edits needed.

> **Exposing Hearth to the internet?** Set the owner password *before* you expose
> it — run it locally first (either of the password-less setups above, or with
> `HEARTH_ALLOW_OPEN=1` for a single boot), set a password under **Settings →
> Security**, then deploy without the flag. Once locked, login works normally on
> any address.

From a locked (password-set) instance you can then
invite others with a single-use link and a **role** (owner / admin / member /
viewer) under **Settings → Households & access**, and layer on **two-factor
authentication** (TOTP — Google Authenticator, 1Password, Aegis…) with one-time
recovery codes.

**Roles** — *owner* (full control, incl. billing/reset), *admin* (manage data,
members and invites), *member* (edit budgeting data), *viewer* (read-only).
Owners/admins manage who has access — change roles, remove access, or reset a
locked-out member's password — under **Settings → Households & access**. If the
member has lost their authenticator too (and their recovery codes are gone), tick
**Also turn off two-factor authentication** when resetting; they can enrol a new
device once they're back in.

**Locked out of the owner account?** No one outranks the owner, so there's no
in-app reset for them. Recover from the box itself:

```bash
npm run reset-owner-password    # prompts for a new password, clears the owner's
                                # 2FA, and signs out their sessions
```

Run it in the instance's directory (or with `DATABASE_URL` set the same way the
server has it) — it prints which database it resolved and asks you to confirm
before writing. It needs shell access to the host, which already means access to
the database, so this hands an attacker nothing new; it just means a lost password
or a lost phone doesn't need a SQL prompt to fix. The reset is recorded in the
audit log as a console event.

**Multiple households & sign-up** — an account can belong to more than one
household (switch between them from the account menu). The **instance owner** (the
owner of the first household — the person who set the server up) can turn on
**open registration** so anyone can create their own account and household from
the sign-in screen; it's **off by default**, keeping a self-host invite-only.
Whole-instance tools (data export/import/reset, backups) are reserved for the
instance owner. See [docs/deployment.md](docs/deployment.md#https--security).

## Tech

TypeScript end-to-end. React + Vite + Mantine (client), Fastify + tRPC (server),
Postgres via Drizzle ORM — embedded [PGlite](https://pglite.dev) by default, or
`pg` (node-postgres) against a real server, selected by `DATABASE_URL`. Money is
stored as integer minor units and timestamps as `timestamptz`; migrations run
automatically on boot.

Coming from an older SQLite build? Migrate the data in one shot:
`npm run db:migrate-from-sqlite -- ./data/app.db` (set `DATABASE_URL` to the new
Postgres target first). It reads the old file directly and imports every table.

## License

[FSL-1.1-MIT](LICENSE.md).
