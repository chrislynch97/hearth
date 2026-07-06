# Deployment guide

Hearth is a **single Node process** that serves both the tRPC API and the built
web UI, backed by a **single SQLite file**. There is no separate frontend host,
no external database, and no message queue — which is what makes self-hosting
easy and backups a matter of copying one folder.

This shape has one consequence worth stating up front: Hearth wants a **persistent
disk**. It fits self-hosting and container/VM hosts perfectly, and is a poor fit
for pure serverless/edge platforms (Vercel/Netlify/Cloudflare Workers), which have
no persistent local disk for the SQLite file.

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
  `app.db` plus a `backups/` folder. **Back up = copy `./data`.**

Update later:

```bash
git pull && docker compose up -d --build
```

See [docker-compose.yml](../docker-compose.yml) and the root [Dockerfile](../Dockerfile).

---

## Option B — Node directly (no Docker)

Prerequisites: Node.js 20+ and git.

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

- **Use 64-bit OS.** libsql ships a native `aarch64` binary but no 32-bit build.
  Check with `uname -m` → it should say `aarch64`.
- **First build is slow.** The initial Docker build compiles dependencies on-device
  (a few minutes on a Pi 5). Subsequent starts are fast.
- A Pi 5 runs Hearth comfortably — it idles at very low CPU and ~100–200 MB RAM.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `file:./data/app.db` | SQLite location (libsql `file:` URL). Can also point at a [Turso](https://turso.tech) remote URL to decouple data from local disk. |
| `CLIENT_DIR` | `../client` (source) | Directory of the built UI. Set to `./dist/client` for a non-Docker production run. The Docker image sets this for you. |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that terminates TLS but doesn't forward `x-forwarded-proto: https`. |
| `HEARTH_TRUST_PROXY` | unset | Set to `1` **only when a reverse proxy / tunnel sits in front** so Fastify reads the real client IP from `X-Forwarded-For` and the login rate limiter throttles per-client. Leave unset when directly exposed — otherwise a client could spoof `X-Forwarded-For` to dodge the limiter. |

Hearth auto-detects HTTPS from `x-forwarded-proto: https` (or a direct HTTPS
connection) and marks the session cookie `Secure` accordingly; `HEARTH_SECURE_COOKIES=1`
is the manual override for proxies that don't set that header. When you front Hearth
with a proxy or tunnel, also set `HEARTH_TRUST_PROXY=1` so the rate limiter sees the
real client IP rather than the proxy's.

---

## Data & backups

Everything Hearth stores is one SQLite file plus JSON backups, both under the data
directory (`./data` on the host, bind-mounted to `/data` in the container).

**Hearth's own backups (app-level).** Enable in **Settings → Data**. These are
portable JSON snapshots written to `<data>/backups`, restorable from within the app
(**Settings → Data → Import**). They are the format you'd use to **migrate Hearth to
a different host** or roll back in-app. You can also export one on demand from the
same screen.

**Copy the data directory (file-level).** Copying `./data` off the host captures the
live `app.db` plus the JSON backups. For a guaranteed-consistent copy of the SQLite
file, stop the container first (`docker compose stop`) so an in-flight write can't
tear the file, then copy, then start it again.

Notes:

- **Neither layer is off-site by default** — both sit on the host disk. For
  protection against the machine dying, periodically copy `./data` (or export the
  JSON) to another device or a cloud target.

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

- **Set a password** (**Settings → Security**). With no password set, the instance
  is open (fine on a trusted LAN; not for public exposure). A single shared password
  gates the whole app; it must be at least 10 characters and very common passwords
  are rejected.
- **Enable two-factor authentication** (**Settings → Two-factor authentication**) for
  anything reachable beyond a trusted network. It adds a TOTP code (Google
  Authenticator, 1Password, Aegis…) on top of the password, with one-time recovery
  codes shown once at enrolment — **save them**, they're your way back in if you lose
  the authenticator.
- **HTTPS matters for the cookie.** The session cookie is only marked `Secure` over
  HTTPS. Terminate TLS at a reverse proxy / tunnel and, if it doesn't forward
  `x-forwarded-proto: https`, set `HEARTH_SECURE_COOKIES=1`.
- **Login is rate-limited** (10 attempts / 15 min per client, then a 15-minute
  block) to slow brute-forcing. Behind a proxy, set `HEARTH_TRUST_PROXY=1` so the
  limit is per real client IP, not per proxy.
- **The database is not encrypted at rest.** The password hash, TOTP secret and
  recovery-code hashes live in the same SQLite file as your data, so two-factor
  protects the *login path*, not someone who already has the file. Keep the data
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

**Build fails on a Raspberry Pi.** You're likely on a 32-bit OS. libsql needs
`aarch64`; reflash with a 64-bit OS (`uname -m` should say `aarch64`).

**Port 8787 already in use.** Change `PORT` (and the compose `ports:` mapping).

**Restoring a large JSON export is rejected.** The server allows a 64 MB request
body; exports above that would need a larger limit (see `bodyLimit` in
[src/server/index.ts](../src/server/index.ts)).
