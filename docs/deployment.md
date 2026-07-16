# Deployment guide

Hearth is a **single Node process** that serves both the tRPC API and the built
web UI, backed by **Postgres**. By default that's an embedded, zero-config
[PGlite](https://pglite.dev) database living in a local folder — so a self-host
needs no separate database server, and backups are a matter of copying one folder.
For a hosted or multi-instance deployment you can instead point `DATABASE_URL` at
a real Postgres server.

This shape has one consequence worth stating up front: the default (embedded)
setup wants a **persistent disk**. It fits self-hosting and container/VM hosts
perfectly, and is a poor fit for pure serverless/edge platforms
(Vercel/Netlify/Cloudflare Workers), which have no persistent local disk — for
those, use an external Postgres via `DATABASE_URL`.

- [Choosing how to host](#choosing-how-to-host)
- [Option A — Docker (recommended)](#option-a--docker-recommended)
- [Option B — Node directly (no Docker)](#option-b--node-directly-no-docker)
- [Raspberry Pi notes](#raspberry-pi-notes)
- [Configuration reference](#configuration-reference)
- [Data & backups](#data--backups)
- [Auto-restart & updates](#auto-restart--updates)
- [Accessing Hearth](#accessing-hearth)
- [HTTPS & security](#https--security)
- [Troubleshooting](#troubleshooting)

---

## Choosing how to host

| Your situation | Use |
|---|---|
| Any always-on PC, VM, NAS, or mini-PC with Docker | [Option A — Docker](#option-a--docker-recommended) |
| A machine without Docker (bare Node) | [Option B — Node directly](#option-b--node-directly-no-docker) |
| A Raspberry Pi (64-bit OS) | [Option A — Docker](#option-a--docker-recommended) |

Both options work anywhere Hearth has a persistent disk.

---

## Option A — Docker (recommended)

Prerequisites: Docker (`curl -fsSL https://get.docker.com | sh` on Linux).

```bash
git clone https://github.com/chrislynch97/hearth.git && cd hearth
docker compose up -d
```

- Open `http://<host-ip>:8787`.
- Migrations and seed run automatically on first boot.
- State lives in `./data` on the host (bind-mounted to `/data` in the container):
  the `pgdata/` PGlite folder plus a `backups/` folder. **Back up = copy `./data`.**

Update later:

```bash
git pull && docker compose up -d --build
```

See [docker-compose.yml](../docker-compose.yml) and the root [Dockerfile](../Dockerfile).

---

## Option B — Node directly (no Docker)

Prerequisites: Node.js 22+ and git.

```bash
git clone https://github.com/chrislynch97/hearth.git && cd hearth
npm install
npm run build            # builds the UI into dist/client
CLIENT_DIR=./dist/client npm start
```

> **Gotcha:** `npm start` defaults `CLIENT_DIR` to the *source* directory. You
> **must** pass `CLIENT_DIR=./dist/client` (as above) or the UI won't be served.

Keep it running with a process manager. Example `systemd` unit
(`/etc/systemd/system/hearth.service`, adjust `User` and paths):

```ini
[Unit]
Description=Hearth
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/hearth
Environment=CLIENT_DIR=./dist/client
Environment=PORT=8787
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hearth
```

Update later: `git pull && npm install && npm run build && sudo systemctl restart hearth`.

---

## Raspberry Pi notes

- **Use a 64-bit OS.** Check with `uname -m` → it should say `aarch64`. (The
  embedded PGlite database is WebAssembly, so there's no native binary to match,
  but the Node/Docker toolchain still expects 64-bit.)
- **First build is slow.** The initial Docker build compiles dependencies on-device
  (a few minutes on a Pi 5). Subsequent starts are fast.
- A Pi 5 runs Hearth comfortably — it idles at very low CPU and ~100–200 MB RAM.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `pglite:./data/pgdata` | Database. Unset (or `pglite:<dir>`) uses the embedded PGlite database in that folder. Set to `postgres://user:pass@host:5432/db` (or `postgresql://…`) to use an external Postgres server — needed to decouple data from local disk or run more than one instance. |
| `CLIENT_DIR` | `../client` (source) | Directory of the built UI. Set to `./dist/client` for a non-Docker production run. The Docker image sets this for you. |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that terminates TLS but doesn't forward `x-forwarded-proto: https`. |
| `HEARTH_TRUST_PROXY` | unset | Set to the **number of proxy hops** in front of Hearth (a single reverse proxy / tunnel = `1`) so Fastify reads the real client IP from `X-Forwarded-For` and the login rate limiter throttles per-client. Leave unset when directly exposed. Do **not** set it to `true`/all — trusting the whole chain lets a client spoof `X-Forwarded-For` and dodge the limiter. Your proxy must **overwrite** (not append to) `X-Forwarded-For`. Also accepts a comma-separated list of trusted proxy IPs/CIDRs. |
| `HEARTH_BACKUP_KEEP` | `14` | How many local snapshots to keep; older ones are pruned after each successful backup. Minimum `1` (a `0` is clamped up rather than pruning the backup just written); a non-integer value is ignored with a warning and the default kept. |
| `HEARTH_BACKUP_LOCAL_DIR` | unset | Absolute path for the **local** snapshots, overriding the default `<data>/backups`. Use it to land backups on a different volume from the database without setting up the off-site machinery. Not to be confused with `HEARTH_BACKUP_DIR` below, which is the *off-site* `directory` target. |
| `HEARTH_BACKUP_OFFSITE` | `off` | Push each verified backup, **encrypted**, to a second location so a lost data volume doesn't lose every backup too (see [Off-site backups](#off-site-backups-optional)). `off` (default) \| `directory` (copy to `HEARTH_BACKUP_DIR`) \| `webhook` (POST to `HEARTH_BACKUP_WEBHOOK_URL`). |
| `HEARTH_BACKUP_PASSPHRASE` | unset | Encrypt backups at rest (AES-256-GCM). When set, **both** the local `<data>/backups` snapshots (`*.json.enc`) and any off-site copies are encrypted with this passphrase; when unset, local snapshots are plaintext JSON. **Required** when `HEARTH_BACKUP_OFFSITE` is enabled. Keep it somewhere separate from the backups — you need it to restore. |
| `HEARTH_BACKUP_DIR` | unset | `directory` mode: the path to copy encrypted backups into. Point it at a **different physical volume** (a second disk, or an NFS/CIFS/rsync mount) — a path on the same volume as the data gives no protection. |
| `HEARTH_BACKUP_WEBHOOK_URL` | unset | `webhook` mode: the endpoint the encrypted backup is `POST`ed to (`application/octet-stream` body; the filename is sent in an `X-Hearth-Backup` header). Use a presigned object-store URL or your own collector. |
| `HEARTH_BACKUP_WEBHOOK_AUTH` | unset | `webhook` mode (optional): a value sent verbatim as the `Authorization` header, e.g. `Bearer <token>`. |

Hearth auto-detects HTTPS from `x-forwarded-proto: https` (or a direct HTTPS
connection) and marks the session cookie `Secure` accordingly; `HEARTH_SECURE_COOKIES=1`
is the manual override for proxies that don't set that header. When you front Hearth
with a single proxy or tunnel, also set `HEARTH_TRUST_PROXY=1` (the hop count) so the
rate limiter sees the real client IP rather than the proxy's. Configure that proxy to
**overwrite** `X-Forwarded-For` with the connecting client's address — if it appends
instead, a client-supplied header value survives and can be used to spoof the IP.

---

## Data & backups

With the default embedded database, everything Hearth stores is the `pgdata`
PGlite folder plus JSON backups, both under the data directory (`./data` on the
host, bind-mounted to `/data` in the container). (With an external Postgres, the
data lives on that server instead; the JSON backups still land under `./data`.)

**Hearth's own backups (app-level).** Enable in **Settings → Data**. These are
portable JSON snapshots written to `<data>/backups`, restorable from within the app
(**Settings → Data → Import**). They are the format you'd use to **migrate Hearth to
a different host** or roll back in-app. You can also export one on demand from the
same screen.

The last 14 snapshots are kept; set `HEARTH_BACKUP_KEEP` to keep more or fewer. To
write them somewhere other than `<data>/backups` — a second disk, say, so a lost data
volume doesn't take the backups with it — set `HEARTH_BACKUP_LOCAL_DIR` to an
absolute path. (Both are in the [configuration reference](#configuration-reference).)

A snapshot contains password hashes and MFA/TOTP secrets, so by default the local
files are owner-only (`0600`) but **plaintext** — on a host-mounted volume, host-side
tooling (or any host-level backup of `./data`) will copy them as-is. To encrypt the
local snapshots at rest, set `HEARTH_BACKUP_PASSPHRASE` (see the
[configuration reference](#configuration-reference)); the files then land as
`*.json.enc` and are decrypted with the same `npm run backup:decrypt` step used for
off-site copies. Keep the passphrase somewhere separate from the backups — you need
it to restore.

**Copy the data directory (file-level).** Copying `./data` off the host captures the
live `pgdata` PGlite folder plus the JSON backups. For a guaranteed-consistent copy,
stop the container first (`docker compose stop`) so an in-flight write can't tear the
files, then copy, then start it again. (Using an external Postgres instead? Use that
server's own backup tooling — `pg_dump` — for the database; `./data` then holds only
the JSON backups.)

Notes:

- **Neither layer is off-site by default** — both sit on the host disk. For
  protection against the machine dying, periodically copy `./data` (or export the
  JSON) to another device or a cloud target, or enable Hearth's built-in
  [off-site backups](#off-site-backups-optional) below.

### Off-site backups (optional)

Hearth's own backups (above) land on the same volume as the database, so losing
that volume loses the database *and* every backup with it. Optionally have the
backup runner push each **verified** snapshot to a second location as well, so a
copy survives the primary volume dying. It's **off by default** — a self-host on
trusted storage with good local backups may not need it.

Because a snapshot contains password hashes and MFA/TOTP secrets, off-site copies
are **always encrypted** (AES-256-GCM, key derived from your passphrase). Set the
target and passphrase via [environment variables](#configuration-reference):

```bash
# Copy each backup to a second mounted volume:
HEARTH_BACKUP_OFFSITE=directory
HEARTH_BACKUP_DIR=/mnt/backup-drive/hearth
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>

# ...or POST each backup to an endpoint (presigned S3 URL, your own collector):
HEARTH_BACKUP_OFFSITE=webhook
HEARTH_BACKUP_WEBHOOK_URL=https://example.com/hearth-backup
HEARTH_BACKUP_WEBHOOK_AUTH=Bearer <token>      # optional
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>
```

Off-site upload is **best-effort**: the local backup is written, verified and kept
regardless, and an off-site failure is logged (and surfaced on **Settings → Data →
Back up now**) but never fails or blocks the local backup. Keep the passphrase
somewhere separate from the backups — you need it to restore.

**Restoring an off-site copy.** The files are `*.json.enc`. Decrypt one back to a
normal Hearth JSON snapshot, then import it from **Settings → Data → Import**:

```bash
HEARTH_BACKUP_PASSPHRASE=<passphrase> npm run backup:decrypt -- backup.json.enc
```

---

## Auto-restart & updates

| | Docker | Node |
|---|---|---|
| Restart on crash | `restart: unless-stopped` (compose) | `Restart=always` (systemd) |
| Start after reboot | `restart: unless-stopped` | `systemctl enable` |
| Update Hearth | `git pull && docker compose up -d --build` | `git pull && npm install && npm run build && systemctl restart hearth` |

---

## Accessing Hearth

**On your LAN:** `http://<host-ip>:8787`.

**Custom local domain.** Add a local DNS record on your router mapping a hostname
to the host's IP, e.g. `hearth.lan → 192.168.1.x`. On UniFi (e.g. a Dream Router):
*Settings → Routing / Policy Engine → DNS → add a local DNS A record*. Then use
`hearth.lan:8787`.

> Avoid a `.local` name — that's reserved for mDNS and gets intercepted before it
> reaches your router's DNS. Use `.lan`, `.home.arpa`, or similar.

**Dropping the `:8787`.** To reach it at a bare `http://hearth.lan`, put a reverse
proxy (e.g. Nginx Proxy Manager) on port 80/443 forwarding to Hearth. This is also
where you'd add HTTPS with a local certificate. Optional.

**Remote access (outside your home).** Two good options:

- **VPN back into your LAN** — e.g. WireGuard or Tailscale. Then `hearth.lan:8787`
  just works remotely. Private and simple; ideal for a finance app.
- **Cloudflare Tunnel** — gives a public HTTPS URL with no port-forwarding, if you
  specifically want public access.

---

## HTTPS & security

- **Accounts & login.** Hearth has per-user accounts. A fresh install auto-creates
  an **owner** account with no password, so the app is **open** on your network with
  no login (fine on a trusted LAN; not for public exposure). Set a password on your
  account (**Settings → Security**) to turn login on — from then on everyone signs in
  with their own username + password. Passwords must be at least 10 characters and
  very common ones are rejected.
- **Invite others with roles** (**Settings → Households & access**). An admin creates
  a single-use invite link (expires in 7 days); the recipient opens it, picks a
  username + password, and joins. Roles: **owner** (full control), **admin** (manage
  settings & invite), **member** (edit budgeting data), **viewer** (read-only). Only
  the owner can remove the password / reopen the instance, and only while they're the
  sole account.
- **Manage who has access** from the same screen: change a member's role, revoke
  access, or reset a locked-out member's password (there's no email-based reset on a
  self-host). Guardrails apply — you can't change or remove yourself, an admin can
  only manage members/viewers, the last owner can't be removed, and you can't reset
  the password of someone who also belongs to another household.
- **Multiple households & self-registration.** An account can belong to more than one
  household and switch between them from the account menu. The **instance owner** (the
  owner of the *first* household — whoever set the server up) can enable **open
  registration** (**Settings → Households & access → "Allow anyone to register"**),
  letting anyone create their own account + household from the sign-in screen. It's
  **off by default** — a self-host stays invite-only until you opt in. Whole-instance
  tools (**Data** export/import/reset and on-disk backups) are reserved for the
  instance owner, so a self-registered member can't read or wipe other households'
  data.
- **Enable two-factor authentication** (**Settings → Two-factor authentication**) for
  anything reachable beyond a trusted network. It adds a TOTP code (Google
  Authenticator, 1Password, Aegis…) on top of your password, with one-time recovery
  codes shown once at enrolment — **save them**, they're your way back in if you lose
  the authenticator. MFA is per-account.
- **HTTPS matters for the cookie.** The session cookie holds a server-side session id
  and is only marked `Secure` over HTTPS. Terminate TLS at a reverse proxy / tunnel
  and, if it doesn't forward `x-forwarded-proto: https`, set `HEARTH_SECURE_COOKIES=1`.
- **Login is rate-limited** — 10 attempts / 15 min per client IP, plus a looser
  per-account cap (50 / 15 min) that catches a distributed brute-force of one
  account without letting a single client lock a victim out. **Self-registration**
  is likewise capped (10 / hour per client) so an open instance can't be spammed
  into mass-creating households. Behind a proxy, set `HEARTH_TRUST_PROXY` to the hop
  count (a single proxy = `1`) so the per-IP limit keys on the real client IP, not
  the proxy — and make the proxy overwrite `X-Forwarded-For`.
- **The database is not encrypted at rest.** Password hashes, TOTP secrets and
  recovery-code hashes live in the same database as your data, so two-factor
  protects the *login path*, not someone who already has the files. Keep the data
  directory (and your backups) on trusted storage.
- **Financial data on a device you own** is the intended posture — prefer a VPN over
  a public URL for remote access.

---

## Troubleshooting

**"I turned on the password but refreshing didn't lock me out."** Expected. Setting
a password logs *your* browser in (it holds a valid session cookie). Test the lock
screen in a **private/incognito window**, a different browser, or after **Settings →
log out**.

**Blank page / UI not served (standalone).** `CLIENT_DIR` isn't pointing at the
build output. Run `npm run build` and start with `CLIENT_DIR=./dist/client`.

**Build fails on a Raspberry Pi.** You're likely on a 32-bit OS. The Node/Docker
toolchain expects `aarch64`; reflash with a 64-bit OS (`uname -m` should say
`aarch64`).

**Port 8787 already in use.** Change `PORT` (and the compose `ports:` mapping).

**Restoring a large JSON export is rejected.** The server allows a 64 MB request
body; exports above that would need a larger limit (see `bodyLimit` in
[src/server/index.ts](../src/server/index.ts)).
