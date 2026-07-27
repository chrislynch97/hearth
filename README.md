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
- **Installable on phones** — "Add to Home Screen" gives Hearth its own icon and
  opens it full-screen, without the browser chrome. It still needs the server, so
  there's no offline mode.

## Quick start (development)

```bash
npm install
npm run dev:server   # API on :8787
npm run dev:client   # UI on :5173 (proxies /trpc to the API)
```

- `npm test` — run the test suite
- `npm run test:e2e` — run the browser smoke suite (see below)
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

### Browser smoke tests

Demo mode doubles as the fixture for the end-to-end suite (`e2e/`, Playwright):

```bash
npm run test:e2e      # build the client, boot the demo server, drive it in Chromium
npm run test:e2e:ui   # the same, in Playwright's watch UI
```

It's a canary, not a second test pyramid — a handful of specs covering the things
unit tests can't see: the app boots past the auth gates, the nav routes, adding a
spend reaches the database and comes back in the register, the funding plan and
settings render. It runs on its own port (8788), so a `npm run demo` you already
have open on 8787 keeps working, and it re-seeds on every run.

The suite can only ever reach the demo database: `npm run demo` pins `DATABASE_URL`
to `./data/demo` itself, so nothing in the Playwright config can point it at real
data. A failed run leaves a report in `playwright-report/`
(`npx playwright show-report`).

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
- **A public VPS under your own domain**:
  ```bash
  docker compose -f docker-compose.public.yml up -d   # → https://your-domain, TLS via Caddy
  ```
  Follow [Option C](docs/deployment.md#option-c--public-vps-under-your-own-domain)
  — the compose file brings its own TLS proxy and public-safe defaults, and the
  walkthrough covers the rest (owner password, MFA, off-site backups, monitoring).

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
| `HEARTH_TRUST_PROXY` | unset | Set to the **number of proxy hops** in front of Hearth (a single reverse proxy / tunnel = `1`) so the login rate limiter keys on the real client IP (`X-Forwarded-For`). Set it to `0` when nothing is proxying Hearth. Do **not** set it to `true`/all — trusting the whole `X-Forwarded-For` chain lets a client spoof the header and dodge the limiter. Your proxy must **overwrite** (not append to) `X-Forwarded-For`. Accepts a hop count, or a comma-separated list of trusted proxy IPs/CIDRs. With `HEARTH_PUBLIC=1` this must be set to something — leaving it unset is a startup error, because a public instance is behind a proxy and getting this wrong silently disarms the rate limiter and the `Secure` cookie flag. |
| `HEARTH_ALLOW_OPEN` | unset | Set to `1` to allow running **open** (no owner password) while bound to a non-loopback address. Without it, an open instance on `0.0.0.0` serves only the login/first-run endpoints and refuses budgeting data — so a public deploy can't accidentally hand anonymous callers full owner access. Set an owner password instead of using this in production. |
| `HEARTH_PUBLIC` | unset | Set to `1` on an **internet-facing** instance. Turns the startup safety checks fatal: the server **refuses to start** if the config would expose your data (`HEARTH_ALLOW_OPEN=1` on a non-loopback bind, or open registration with no owner password) or would leave it defending itself badly (`HEARTH_TRUST_PROXY` unset, so the rate limiter throttles every client as one and the session cookie isn't `Secure`), instead of merely warning. Recommended for any public deploy — a config mistake then stops the server rather than exposing a household's finances. Leave unset on a home LAN, where those states are legitimate. |
| `HEARTH_ALLOWED_ORIGINS` | unset | Extra origins allowed to make state-changing requests, comma-separated (`https://hearth.example.com`). Writes must come from the same origin the app is served on; you only need this if a proxy in front rewrites the `Host` header so it no longer matches the address the browser actually used. Requests without an `Origin` header (curl, scripts, health checks) are unaffected. |
| `HEARTH_MAIL_TRANSPORT` | `off` | Turns on the email-backed features: invite-by-email, address confirmation, and self-service password reset (see [Email](#email-optional)). `off` \| `smtp` (a real relay) \| `log` (print the message instead of sending — development only, and refused when `HEARTH_PUBLIC=1`, because it writes live tokens to the server log). |
| `HEARTH_MAIL_FROM` | unset | `From:` address on every email Hearth sends, e.g. `Hearth <hearth@example.com>`. **Required** when email is on. |
| `HEARTH_PUBLIC_URL` | unset | The URL people reach this instance on (`https://hearth.example.com`) — emailed links are built from it, so a wrong value sends every invitee and reset link to the wrong host. **Required** when email is on. |
| `HEARTH_SMTP_HOST` | unset | Relay hostname. **Required** for `HEARTH_MAIL_TRANSPORT=smtp`. |
| `HEARTH_SMTP_PORT` | `587`, or `465` for implicit TLS | Relay port. |
| `HEARTH_SMTP_TLS` | `starttls` | `starttls` upgrades the connection and **refuses to send** if the relay doesn't offer it; `implicit` is TLS from the first byte (port 465); `none` is cleartext — only for a relay on localhost. |
| `HEARTH_SMTP_USER` / `HEARTH_SMTP_PASS` | unset | Relay credentials. Omit both for an unauthenticated relay; setting a user with no password is a startup error. |
| `HEARTH_DEPLOY` | unset | Set to `image` by the GHCR compose files (`docker-compose.ghcr.yml`). Tells the in-app update UI this is the prebuilt-image deploy, so it shows `pull`-based update commands and — with the host updater — enables one-click / automatic updates. Any other value (or unset) means a build-from-source deploy. See [Updating](docs/deployment.md#updating--three-ways). |
| `HEARTH_COMPOSE_FILE` | inferred | Compose file the in-app update card names in its copy-paste commands. Unset, it's inferred from `HEARTH_DEPLOY` + `DATABASE_URL`; set it if you run a compose file other than the four shipped ones (`docker-compose.public.yml` sets it to itself). The host updater reads the same variable. |
| `HEARTH_UPDATE_DIR` | `<data>/updates` | Where the app and the host updater exchange update control files (request / result / heartbeat). Defaults next to your data dir; only set it if you relocate that exchange. |
| `HEARTH_UPDATE_CHECK` | unset | Set to `off` to stop Hearth checking GitHub for new releases. That check is the app's only outbound request, so this is the switch for an instance that should make none — it also hides the update banner. Any other value leaves the check on; switched off, it reports the same "couldn't check" state as being offline. |
| `HEARTH_UPDATE_TOKEN` | unset | GitHub token the update check uses to read the latest release. Only needed when your repo is **private** — GitHub 404s an unauthenticated request to a private repo's releases, so the check silently finds nothing. Needs **read only** (`contents: read` / classic `repo`), never write. Falls back to `HEARTH_FEEDBACK_TOKEN` if that's set against the same repo. Public repos need neither. |
| `HEARTH_FEEDBACK_TOKEN` | unset | GitHub token with **issues: write** on the target repo. Setting it turns on the in-app **Send feedback** entry (account menu), which files a bug/idea straight to GitHub; left unset the feature is hidden. Use a **fine-grained** token scoped to the one repo — reports land in a **public** repo, which the form makes clear to submitters. |
| `HEARTH_FEEDBACK_REPO` | `chrislynch97/hearth` | `owner/repo` in-app feedback is filed against. Defaults to upstream; point it at your own fork to keep reports. Only used when `HEARTH_FEEDBACK_TOKEN` is set. |

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
> any address. Also set **`HEARTH_PUBLIC=1`** on the deployed instance: it makes
> the startup safety checks refuse to boot on exactly the config mistakes above,
> so a stray flag can't quietly expose your data.

From a locked (password-set) instance you can then
invite others with a single-use link and a **role** (owner / admin / member /
viewer) under **Settings → Households & access**, and layer on **two-factor
authentication** (TOTP — Google Authenticator, 1Password, Aegis…) with one-time
recovery codes. An invite link is a credential until it's used or expires (7
days), so share it privately — the token sits in the URL's `#fragment` so it stays
out of server and proxy logs, but not out of whatever channel you send it over.

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
# Source checkout
npm run reset-owner-password    # prompts for a new password, clears the owner's
                                # 2FA, and signs out their sessions

# Docker — from the compose directory
docker compose exec hearth node dist/reset-owner-password.js
```

Run it in the instance's directory (or with `DATABASE_URL` set the same way the
server has it) — it prints which database it resolved and asks you to confirm
before writing. In the container that's already true: it inherits the same
`DATABASE_URL` as the server. It needs shell access to the host, which already means access to
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

## Email (optional)

**Off by default, and a self-host install doesn't need it.** Invites are
copy-a-link, and a lost owner password is recovered from the box with
`reset-owner-password` above. Point Hearth at a mail relay and three things
switch on:

- **Invite by email** — the invite form grows an address field and sends the link
  there. You still get the link back to copy, so a relay that's down costs the
  invitee an email, not their invitation.
- **Confirm your address** — Settings → Account offers to send a confirmation
  link. This is what makes an address trustworthy: it was entered by whoever
  holds the account, and proven by someone who can read that inbox.
- **Forgot your password** — the sign-in screen offers a reset link. It's only
  ever mailed to a **confirmed** address, so a typo in a profile form can't hand
  account recovery to a stranger, and the reset **doesn't sign you in** — you go
  back through the login screen, so two-factor authentication still applies.

```bash
HEARTH_MAIL_TRANSPORT=smtp
HEARTH_MAIL_FROM='Hearth <hearth@example.com>'
HEARTH_PUBLIC_URL=https://hearth.example.com   # emailed links are built from this
HEARTH_SMTP_HOST=smtp.example.com
HEARTH_SMTP_USER=apikey                        # omit both for an unauthenticated relay
HEARTH_SMTP_PASS=<the relay password>
```

Hearth refuses to send in the clear by default: `HEARTH_SMTP_TLS` is `starttls`,
so a relay that stops offering TLS fails loudly rather than posting reset tokens
in plaintext. Every emailed token lives in the URL **fragment**, which browsers
never send to a server — so a live credential can't end up in an access log.

To see the emails without a relay, set `HEARTH_MAIL_TRANSPORT=log` and Hearth
prints each message to the server log instead of sending it. That prints live
tokens, so it's development-only — `HEARTH_PUBLIC=1` refuses to start with it.

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
