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
- [Option A — Docker (recommended standalone)](#option-a--docker-recommended-standalone)
- [Option B — Node directly (no Docker)](#option-b--node-directly-no-docker)
- [Option C — Home Assistant OS add-on](#option-c--home-assistant-os-add-on)
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
| Any always-on PC, VM, NAS, or mini-PC with Docker | [Option A — Docker](#option-a--docker-recommended-standalone) |
| A machine without Docker (bare Node) | [Option B — Node directly](#option-b--node-directly-no-docker) |
| A Raspberry Pi running **Home Assistant OS** | [Option C — HA add-on](#option-c--home-assistant-os-add-on) |
| A Raspberry Pi running plain Raspberry Pi OS | [Option A — Docker](#option-a--docker-recommended-standalone) |

Options A and B are the **default** path and work anywhere. Option C is specific
to Home Assistant OS, whose appliance model doesn't allow plain `docker compose`.

---

## Option A — Docker (recommended standalone)

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

## Option C — Home Assistant OS add-on

Home Assistant OS is a locked-down appliance: it runs its own Supervisor-managed
Docker and does **not** give you a normal shell or `docker compose`. So Hearth
ships as a **Home Assistant add-on** you install from this repo.

### Install

1. In Home Assistant: **Settings → Add-ons → Add-on Store**.
2. Top-right **⋮ → Repositories**, paste `https://github.com/chrislynch97/hearth`, **Add**.
3. Find **Hearth** in the store → **Install**. The first build takes a few minutes
   (it clones and builds the app on-device).
4. **Start** the add-on → **Open Web UI** (or browse to `http://<ha-host>:8787`).
5. Set a password in **Settings → Security**.

The add-on manifest lives at [hearth/config.yaml](../hearth/config.yaml); it builds
via [hearth/Dockerfile](../hearth/Dockerfile).

### Access

Hearth runs on **its own port (8787)**, separate from Home Assistant's own port —
you access it directly (e.g. `http://homeassistant.local:8787`), not inside the HA
UI. (It does not use HA Ingress, so it keeps its own login and, deliberately, is
**not** proxied by Nabu Casa Cloud — see [Accessing Hearth](#accessing-hearth).)

### Add-on toggles (verify once after install)

The manifest sets sensible defaults; confirm them on the add-on page:

- **Start on boot** — ON. Hearth returns after HA restarts, host reboots, and
  HA OS/Core updates.
- **Watchdog** — ON. Supervisor polls the web UI and restarts Hearth if it hangs
  or crashes.
- **Auto update** — your choice. OFF means you trigger rebuilds yourself.

### Data

Everything lives in the add-on's persistent `/data` (`app.db` + `backups/`), which
survives restarts, reboots, and rebuilds. The add-on uses **cold backups**
(`backup: cold`), so when Home Assistant backs it up it stops the add-on briefly
to copy a consistent database — see [Data & backups](#data--backups).

### Update

Releases are driven by the `version` in [hearth/config.yaml](../hearth/config.yaml):

1. Push your app changes to `main`.
2. Bump `version` and push.
3. In the Add-on Store, **⋮ → Reload** so HA re-reads the repo and sees the new
   version, then click **Update** on the add-on (or enable **Auto update**).

The build re-clones the latest `main`, and the version bump busts the Docker
layer cache (via the `BUILD_VERSION` build arg), so an Update always picks up your
newest commits. Pushing code **without** bumping `version` shows no Update prompt.

---

## Raspberry Pi notes

- **Use 64-bit OS.** libsql ships a native `aarch64` binary but no 32-bit build.
  Check with `uname -m` → it should say `aarch64`. (HA OS on a Pi 4/5 is 64-bit.)
- **First build is slow.** Whether via Docker or the HA add-on, the initial build
  compiles dependencies on-device (a few minutes on a Pi 5). Subsequent starts are fast.
- A Pi 5 comfortably runs Hearth alongside Home Assistant — Hearth idles at very
  low CPU and ~100–200 MB RAM.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `file:./data/app.db` | SQLite location (libsql `file:` URL). Can also point at a [Turso](https://turso.tech) remote URL to decouple data from local disk. |
| `CLIENT_DIR` | `../client` (source) | Directory of the built UI. Set to `./dist/client` for a non-Docker production run. Docker/add-on images set this for you. |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that terminates TLS but doesn't forward `x-forwarded-proto: https`. |

Hearth auto-detects HTTPS from `x-forwarded-proto: https` (or a direct HTTPS
connection) and marks the session cookie `Secure` accordingly; `HEARTH_SECURE_COOKIES=1`
is the manual override for proxies that don't set that header.

---

## Data & backups

Everything Hearth stores is one SQLite file plus JSON backups, both under the data
directory (`./data` standalone, `/data` in Docker/the add-on). There are **two
independent backup layers** — run both:

**1. Hearth's own backups (app-level).** Enable in **Settings → Data**. These are
portable JSON snapshots written to `<data>/backups`, restorable from within the app
(**Settings → Data → Import**). They are the format you'd use to **migrate Hearth to
a different host** or roll back in-app. You can also export one on demand from the
same screen.

**2. Home Assistant backups (HA add-on only).** HA snapshots the add-on's entire
`/data` directory — the **live `app.db`** *and* the JSON backups. A full HA backup
therefore already contains your real database; you restore it by restoring the
add-on. Make sure the **Hearth add-on is selected** in any partial/automatic backup
you rely on (full backups include it automatically).

Notes:

- The add-on sets `backup: cold` so HA stops Hearth for a few seconds during a
  backup and copies a **consistent** database (a hot copy of a live SQLite file can
  be torn).
- **Neither layer is off-site by default** — both sit on the host disk. For
  protection against the machine dying: point HA backups at an off-device target
  (Nabu Casa, a network share, Google Drive add-on), or periodically copy `./data` /
  export the JSON off the box.

---

## Auto-restart & updates

| | Standalone (Docker) | Standalone (Node) | HA add-on |
|---|---|---|---|
| Restart on crash | `restart: unless-stopped` (compose) | `Restart=always` (systemd) | **Watchdog** toggle |
| Start after reboot | `restart: unless-stopped` | `systemctl enable` | **Start on boot** toggle |
| Survives host/OS update | n/a | n/a | Yes, via Start on boot (brief outage during the update) |
| Update Hearth | `git pull && docker compose up -d --build` | `git pull && npm install && npm run build && systemctl restart hearth` | Bump `version` → **⋮ → Reload** → **Update** |

For the HA add-on, an **HA OS/Core update reboots the whole box**, so Hearth is
briefly down during the update and then comes back automatically.

---

## Accessing Hearth

**On your LAN:** `http://<host-ip>:8787` (e.g. `http://homeassistant.local:8787`
for the add-on).

**Custom local domain.** Add a local DNS record on your router mapping a hostname
to the host's IP, e.g. `hearth.lan → 192.168.1.x`. On UniFi (e.g. a Dream Router):
*Settings → Routing / Policy Engine → DNS → add a local DNS A record*. Then use
`hearth.lan:8787`.

> Avoid a `.local` name — that's reserved for mDNS and gets intercepted before it
> reaches your router's DNS. Use `.lan`, `.home.arpa`, or similar.

**Dropping the `:8787`.** To reach it at a bare `http://hearth.lan`, put a reverse
proxy (e.g. Nginx Proxy Manager) on port 80/443 forwarding to Hearth. This is also
where you'd add HTTPS with a local certificate. Optional.

**Remote access (outside your home).** Because Hearth uses a direct port (not HA
Ingress), **Nabu Casa Cloud does not proxy it** — Nabu Casa only exposes Home
Assistant itself and Ingress add-ons. Good options instead:

- **VPN back into your LAN** — e.g. UniFi Teleport, WireGuard, or the Tailscale HA
  add-on. Then `hearth.lan:8787` just works remotely. Private and simple; ideal for
  a finance app.
- **Cloudflare Tunnel** — gives a public HTTPS URL with no port-forwarding, if you
  specifically want public access.

---

## HTTPS & security

- **Set a password** (**Settings → Security**). With no password set, the instance
  is open (fine on a trusted LAN; not for public exposure). A single shared password
  is the v1 auth model.
- **HTTPS matters for the cookie.** The session cookie is only marked `Secure` over
  HTTPS. Terminate TLS at a reverse proxy / tunnel and, if it doesn't forward
  `x-forwarded-proto: https`, set `HEARTH_SECURE_COOKIES=1`.
- **Login is rate-limited** (10 attempts / 15 min per client, then a 15-minute
  block) to slow brute-forcing.
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

**Port 8787 already in use.** Change `PORT` (and the compose `ports:` mapping, or
the add-on's port in its Configuration tab).

**HA add-on: first build takes minutes.** Normal — it clones and builds on-device.
Only the first build (and rebuilds) are slow; starts are fast. If a build errors,
check the add-on **Log** tab.

**Restoring a large JSON export is rejected.** The server allows a 64 MB request
body; exports above that would need a larger limit (see `bodyLimit` in
[src/server/index.ts](../src/server/index.ts)).
