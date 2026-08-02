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
- [Option C — public VPS under your own domain](#option-c--public-vps-under-your-own-domain)
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
| A cloud VPS on the public internet, under your own domain | [Option C — public VPS](#option-c--public-vps-under-your-own-domain) |

All three work anywhere Hearth has a persistent disk. A and B assume a network you
trust; C is A plus a TLS proxy and the configuration a public address needs.

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

## Option C — public VPS under your own domain

Hearth on a rented Linux box, reachable at `https://hearth.example.com` from
anywhere, invite-only. This is the shape to use when a VPN back to your house
isn't practical — a household member who won't run a VPN client, or no always-on
machine at home to run Hearth on in the first place.

It's Option A plus two things: a reverse proxy terminating TLS in front of the
app, and the configuration that makes a public address safe. Both are in
[docker-compose.public.yml](../docker-compose.public.yml), which runs the
prebuilt image behind [Caddy](https://caddyserver.com) (automatic Let's Encrypt
certificates, renewed for you) and sets `HEARTH_PUBLIC=1` + `HEARTH_TRUST_PROXY=1`
itself — so the documented path is the safe one without you having to remember
the flags.

Work through the steps in order. Several of them (owner password, MFA, closed
registration) are things you want true **before** the address is handed out, not
after.

### 1. Prepare the host

- **Pick the region deliberately** — this is a household's finances. UK/EU if
  that's where you are.
- **Encrypt the disk** (LUKS, or the provider's own encryption-at-rest). Hearth's
  database is not encrypted at rest, so this is the layer that protects a
  decommissioned or seized volume.
- **SSH: keys only.** Set `PasswordAuthentication no`, log in as a non-root user
  with sudo.
- **Firewall: 80, 443, SSH, nothing else.** Note that Docker's published ports
  bypass `ufw`/`firewalld` — the compose file therefore publishes the app on
  `127.0.0.1` only, so the firewall isn't the only thing standing between the
  internet and port 8787.
- **Turn on unattended security updates** (`unattended-upgrades` on Debian/Ubuntu).
  Nobody is watching this box day to day.
- **Install Docker**: `curl -fsSL https://get.docker.com | sh`.

### 2. Point the domain at it

Add an `A` (and `AAAA` if you have IPv6) record for the hostname you'll use,
pointing at the VPS. Do this **before** the first start: Caddy proves control of
the name over port 80 to get the certificate, and that can't work until DNS
resolves and the port is reachable.

Putting Cloudflare's proxy in front is optional, and complicates the one thing
this setup has to get right. Use **Full (strict)** TLS mode so Cloudflare still
validates Caddy's certificate, and take the client address from Cloudflare's own
header instead of the connecting one (which is now a Cloudflare edge, not your
visitor) — in [deploy/Caddyfile](../deploy/Caddyfile):

```
header_up X-Forwarded-For {http.request.header.Cf-Connecting-Ip}
```

`HEARTH_TRUST_PROXY` stays `1`. Restrict the host firewall to
[Cloudflare's IP ranges](https://www.cloudflare.com/ips/) as well: a header is
only trustworthy if nobody can reach the origin without going through the thing
that sets it.

### 3. Start it

```bash
git clone https://github.com/chrislynch97/hearth.git && cd hearth
printf 'HEARTH_DOMAIN=hearth.example.com\nACME_EMAIL=you@example.com\n' > .env
docker compose -f docker-compose.public.yml up -d
```

(The image comes from GHCR. If you're running your own fork, make the package
public once — see the [GHCR image visibility](#updating--three-ways) note — or
the pull fails on an unauthenticated host.)

Watch the first boot — a certificate failure or a refused start both show up here:

```bash
docker compose -f docker-compose.public.yml logs -f
```

Then open `https://hearth.example.com`. What you should see in the logs:

- Caddy obtaining a certificate for your domain (`certificate obtained successfully`).
- Hearth logging `listening on 0.0.0.0:8787` — **not** `REFUSING TO START`. That
  message is `HEARTH_PUBLIC=1` doing its job; it names exactly which setting is
  wrong (see [Configuration](#configuration-reference)).

The proxy is configured to **overwrite** `X-Forwarded-For` with the connecting
address ([deploy/Caddyfile](../deploy/Caddyfile)). Keep that if you edit it —
appending instead lets a client prepend a fake IP and dodge the login limiter.

### 4. Set an owner password, then enable MFA

A fresh install has an owner account with **no password**. Until you set one the
instance serves nothing but the first-run and login endpoints, so it isn't
handing out data — but it is a race you don't want to run for long.

1. **Settings → Security → set a password** on the owner account. Login is now on
   for everybody.
2. **Settings → Two-factor authentication → enable.** Do this before the address
   is shared, not after. **Save the recovery codes somewhere off the box** —
   they're the way back in if you lose the authenticator, and there's no
   email-based reset on a self-host.
3. Check the lock actually took **in a private window**. The browser you set the
   password in holds a valid session cookie, so it stays signed in — which looks
   exactly like the password not having worked.

### 5. Confirm it's invite-only

- **Settings → Households & access** → "Allow anyone to register" is **off**
  (it's off by default). With it on, anyone who finds the URL can create an
  account and a household of their own.
- Invite the people who should be here from that same screen — a single-use link
  that expires in 7 days.
- Verify `HEARTH_ALLOW_OPEN` isn't set **on the running container**, not just in
  the file:

  ```bash
  docker compose -f docker-compose.public.yml exec hearth env | grep -E 'HEARTH_(PUBLIC|TRUST_PROXY|ALLOW_OPEN)'
  ```

  Expect `HEARTH_PUBLIC=1` and `HEARTH_TRUST_PROXY=1`, and no `HEARTH_ALLOW_OPEN`
  line at all. (With `HEARTH_PUBLIC=1` a stray `HEARTH_ALLOW_OPEN=1` would have
  refused to start — this confirms it rather than trusting that it would.)

### 6. Get the backups off the box

The VPS disk is not yours and the provider's snapshots aren't a restore you've
tested. Turn on [off-site backups](#off-site-backups-optional) — add to `.env`:

```bash
HEARTH_BACKUP_OFFSITE=s3
HEARTH_BACKUP_S3_ENDPOINT=https://<bucket>.s3.<region>.amazonaws.com
HEARTH_BACKUP_S3_BUCKET=<bucket>
HEARTH_BACKUP_S3_REGION=<region>
HEARTH_BACKUP_S3_ACCESS_KEY_ID=<key>
HEARTH_BACKUP_S3_SECRET_ACCESS_KEY=<secret>
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>
```

then `docker compose -f docker-compose.public.yml up -d` to apply. Enable the
schedule in **Settings → Data**, hit **Back up now**, and confirm a copy actually
landed at the target.

If the VPS's disk isn't durable across redeploys, also set
`HEARTH_BACKUP_PRIMARY=offsite` so a failed upload fails the backup instead of
leaving you with files the next deploy deletes — see
[Making off-site the primary store](#making-off-site-the-primary-store).

**Keep the passphrase off the box** — in your password manager, not in the `.env`
you'd lose along with the server.

**Then do a restore drill.** A backup that has never been restored isn't a
backup. Take a real backup, decrypt it (`npm run backup:decrypt`, from a source
checkout with `npm install` run — your laptop, not the VPS), and import it into a
throwaway instance — the [demo mode](../README.md#demo-mode) database is a safe
target — then look at the data. Repeat the drill after any change to how backups
are stored.

### 7. Watch it from outside

- Point an external uptime monitor at `https://hearth.example.com/healthz` every
  5 minutes, alerting on non-200. See [Uptime checks](#uptime-checks) — it must
  run somewhere other than this box.
- Set `HEARTH_BACKUP_HEARTBEAT_URL` so a backup that silently stops running
  raises an alarm, and `HEARTH_ALERT_WEBHOOK` for backup and failed-login alerts.
  See [Monitoring & alerting](#monitoring--alerting).
- Scan the deployed host once it's up: [SSL Labs](https://www.ssllabs.com/ssltest/)
  for the TLS config, [securityheaders.com](https://securityheaders.com) for the
  headers Hearth sends.
- Sign in once with a deliberately wrong password and check the audit trail
  (**Settings → Security**) recorded *your* address rather than the proxy's —
  that's `HEARTH_TRUST_PROXY` proven end-to-end rather than assumed.

### Moving an existing instance here

Migrating from a LAN box is an export and an import, not a file copy — the JSON
snapshot is portable across hosts and across database engines (PGlite ↔ Postgres),
which a copied `pgdata` folder is not.

1. On the old host: **Settings → Data → Export**, and keep the file somewhere safe
   — it contains password hashes and MFA secrets.
2. Stand up the new instance through the steps above.
3. On the new host: **Settings → Data → Import**, then check the totals against
   the old instance before you retire it.
4. Keep the old box running (unreachable, but intact) until you've used the new
   one for a few days.

Accounts, households and MFA enrolments come across in the export, so everyone
signs in with the credentials they already had.

### Updating

`docker-compose.public.yml` runs the prebuilt image, so updating is a pull:

```bash
docker compose -f docker-compose.public.yml pull
docker compose -f docker-compose.public.yml up -d
```

Re-copy `docker-compose.public.yml` from the release you've pulled as part of
that — the pull updates the image only, and a compose file older than the image
silently drops any `HEARTH_*` added since. See
[Updating — three ways](#updating--three-ways).

For **Update now** and scheduled auto-updates from inside the app, install the
host updater as in [Updating — three ways](#updating--three-ways), pointing it at
this compose file:

```bash
HEARTH_COMPOSE_FILE=docker-compose.public.yml
```

Set that in the systemd unit (or cron line) on the host. The compose file already
passes the same value to the app, so the commands the in-app update card shows
name this file rather than the default one.

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

Every `HEARTH_*` variable below can be set in a `.env` file next to whichever
compose file you run — **provided your copy of the compose file is as new as the
variable**. A `.env` value only reaches the container if the compose file passes
it through, and updating the image does not update your compose file (see
[Updating — three ways](#updating--three-ways)). Hearth checks this for you: it
logs a warning at startup, and shows one in **Settings → System → Updates**,
naming every setting your compose file doesn't pass in.

Two variables are deliberately not passed through and aren't part of that check:
`docker-compose.public.yml` ignores `HEARTH_ALLOW_OPEN` entirely (so a value left
over from a LAN `.env` can't reach a public box) and fixes `HEARTH_PUBLIC=1` /
`HEARTH_TRUST_PROXY=1`, and `HEARTH_DEPLOY` is set by the file rather than by you.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `DATABASE_URL` | `pglite:./data/pgdata` | Database. Unset (or `pglite:<dir>`) uses the embedded PGlite database in that folder. Set to `postgres://user:pass@host:5432/db` (or `postgresql://…`) to use an external Postgres server — needed to decouple data from local disk or run more than one instance. |
| `CLIENT_DIR` | `../client` (source) | Directory of the built UI. Set to `./dist/client` for a non-Docker production run. The Docker image sets this for you. |
| `HEARTH_SECURE_COOKIES` | unset | Set to `1` to force `Secure` session cookies when behind a reverse proxy that terminates TLS but doesn't forward `x-forwarded-proto: https`. |
| `HEARTH_TRUST_PROXY` | unset | Set to the **number of proxy hops** in front of Hearth (a single reverse proxy / tunnel = `1`) so Fastify reads the real client IP from `X-Forwarded-For` and the login rate limiter throttles per-client. Set it to `0` to declare that nothing is proxying Hearth. Do **not** set it to `true`/all — trusting the whole chain lets a client spoof `X-Forwarded-For` and dodge the limiter. Your proxy must **overwrite** (not append to) `X-Forwarded-For`. Also accepts a comma-separated list of trusted proxy IPs/CIDRs. **Required when `HEARTH_PUBLIC=1`** — see the next row. |
| `HEARTH_PUBLIC` | unset | Set to `1` on an **internet-facing** instance. Hearth checks its own configuration at startup and, with this set, **refuses to start** rather than come up misconfigured: `HEARTH_ALLOW_OPEN=1`, open registration with no owner password, or `HEARTH_TRUST_PROXY` left unset. Left unset (a home LAN) the first two only log a warning and the third isn't checked at all. With it set, the bind address stops excusing anything — a public instance bound to `127.0.0.1` has a reverse proxy on the same host, so it is treated as reachable off-box and `HEARTH_ALLOW_OPEN` is ignored outright. It additionally makes an email address **compulsory on every new account** — see [Account recovery](#account-recovery). `NODE_ENV` can't stand in for this: the Docker image sets it to `production` for every deployment, LAN ones included. |
| `HEARTH_ALLOW_OPEN` | unset | Set to `1` to allow running **open** (no owner password) while bound to a non-loopback address — a trusted home LAN. Without it, an open instance on `0.0.0.0` serves only the login/first-run endpoints and refuses budgeting data, so an accidental public deploy can't hand anonymous callers owner access. It is a LAN-only flag: with `HEARTH_PUBLIC=1` it is refused at startup and ignored at runtime, because open access resolves every anonymous caller as the owner of the first household. |
| `HEARTH_BACKUP_KEEP` | `14` | How many snapshots to keep; older ones are pruned after each successful backup. Applies to the local store and — for targets Hearth can enumerate (`s3`, `directory`) — to the off-site one too. Minimum `1` (a `0` is clamped up rather than pruning the backup just written); a non-integer value is ignored with a warning and the default kept. |
| `HEARTH_BACKUP_LOCAL_DIR` | unset | Absolute path for the **local** snapshots, overriding the default `<data>/backups`. Use it to land backups on a different volume from the database without setting up the off-site machinery. Not to be confused with `HEARTH_BACKUP_DIR` below, which is the *off-site* `directory` target. |
| `HEARTH_BACKUP_OFFSITE` | `off` | Push each verified backup, **encrypted**, to a second location so a lost data volume doesn't lose every backup too (see [Off-site backups](#off-site-backups-optional)). `off` (default) \| `s3` (any S3-compatible object store) \| `directory` (copy to `HEARTH_BACKUP_DIR`) \| `webhook` (POST to `HEARTH_BACKUP_WEBHOOK_URL`). |
| `HEARTH_BACKUP_PRIMARY` | `local` | Which copy *is* the backup. `local` (default) keeps today's behaviour: the off-site copy is supplementary and a failed upload never fails the backup. `offsite` makes the remote copy authoritative for a host with no durable disk — Hearth refuses to start without a working off-site target, a failed upload fails the backup, and the local file is staging only. See [Making off-site the primary store](#making-off-site-the-primary-store). An unrecognised value is fatal rather than silently treated as `local`. |
| `HEARTH_BACKUP_PASSPHRASE` | unset | Encrypt backups at rest (AES-256-GCM). When set, **both** the local `<data>/backups` snapshots (`*.json.enc`) and any off-site copies are encrypted with this passphrase; when unset, local snapshots are plaintext JSON. **Required** when `HEARTH_BACKUP_OFFSITE` is enabled. Keep it somewhere separate from the backups — you need it to restore. |
| `HEARTH_BACKUP_DIR` | unset | `directory` mode: the path to copy encrypted backups into. Point it at a **different physical volume** (a second disk, or an NFS/CIFS/rsync mount) — a path on the same volume as the data gives no protection. |
| `HEARTH_BACKUP_WEBHOOK_URL` | unset | `webhook` mode: the endpoint the encrypted backup is `POST`ed to (`application/octet-stream` body; the filename is sent in an `X-Hearth-Backup` header). Use a presigned object-store URL or your own collector. |
| `HEARTH_BACKUP_WEBHOOK_AUTH` | unset | `webhook` mode (optional): a value sent verbatim as the `Authorization` header, e.g. `Bearer <token>`. Write-only, so this target supports neither in-app restore nor off-site retention. |
| `HEARTH_BACKUP_S3_ENDPOINT` | unset | `s3` mode: the service origin. If the bucket name starts the hostname (`https://<bucket>.s3.<region>.amazonaws.com`) requests are addressed virtual-hosted; otherwise (`https://minio.example.com`) path-style. No SDK is used — requests are signed with SigV4 directly. |
| `HEARTH_BACKUP_S3_BUCKET` | unset | `s3` mode: the bucket name. |
| `HEARTH_BACKUP_S3_REGION` | `us-east-1` | `s3` mode: the signing region. `auto` for Cloudflare R2; the default suits MinIO and other services that don't care. |
| `HEARTH_BACKUP_S3_ACCESS_KEY_ID` | unset | `s3` mode: access key. Needs `PutObject`, `GetObject`, `DeleteObject` and `ListBucket` — the last two for retention and in-app restore. |
| `HEARTH_BACKUP_S3_SECRET_ACCESS_KEY` | unset | `s3` mode: secret key. |
| `HEARTH_BACKUP_S3_PREFIX` | unset | `s3` mode (optional): key prefix, so one bucket can hold several instances. Letters, digits, dot, dash, underscore and slash only. |
| `HEARTH_DISK_MIN_FREE_MB` | `512` | Free space on the data volume below which `/healthz` reports **degraded** (HTTP 503). See [Monitoring & alerting](#monitoring--alerting). A non-integer value is ignored and the default kept. |
| `HEARTH_BACKUP_HEARTBEAT_URL` | unset | A ping URL (e.g. a [Healthchecks.io](https://healthchecks.io) check) that Hearth `POST`s after each successful automatic backup, and to `<url>/fail` when one fails. Gives you dead-man's-switch alerting: you hear about backups that stopped running, not just ones that ran and failed. |
| `HEARTH_ALERT_WEBHOOK` | unset | Endpoint that receives operational alerts as JSON (`{ event, message, detail, at }`) — backup failures, off-site upload failures, and failed-login bursts. [ntfy](https://ntfy.sh)'s `X-Title` / `X-Priority` headers are sent alongside so the notification is titled and failures arrive as high priority; other targets ignore them. Point it at whatever you already get notified through. |
| `HEARTH_AUTH_ALERT_THRESHOLD` | `10` | Failed sign-ins in an hour that raise an `auth_failures` alert. `0` turns the check off. |
| `HEARTH_MAIL_TRANSPORT` | `off` | Turns on the email-backed features — invite-by-email, address confirmation, self-service password reset (see [Email](#email-optional)). `off` \| `smtp` \| `log`. The `log` transport prints each message instead of sending it, which puts live invite and reset tokens in the server log; `HEARTH_PUBLIC=1` therefore refuses to start with it. |
| `HEARTH_MAIL_FROM` | unset | `From:` address on outgoing mail, e.g. `Hearth <hearth@example.com>`. **Required** when email is on. |
| `HEARTH_PUBLIC_URL` | unset | The origin people reach this instance on (`https://hearth.example.com`). Every emailed link is built from it, so a wrong value sends invitees and reset links somewhere else entirely. **Required** when email is on; a value that isn't an absolute `http(s)` URL is a startup error. |
| `HEARTH_SMTP_HOST` | unset | Relay hostname. **Required** for `HEARTH_MAIL_TRANSPORT=smtp`. |
| `HEARTH_SMTP_PORT` | `587` (`465` with implicit TLS) | Relay port. |
| `HEARTH_SMTP_TLS` | `starttls` | `starttls` upgrades the connection and **refuses to send** if the relay doesn't offer it — so a relay that quietly stops advertising TLS fails loudly instead of posting reset tokens in plaintext. `implicit` is TLS from the first byte (port 465). `none` is cleartext; only defensible for a relay on localhost. |
| `HEARTH_SMTP_USER` | unset | Relay username. Omit (with `HEARTH_SMTP_PASS`) for an unauthenticated relay. |
| `HEARTH_SMTP_PASS` | unset | Relay password. Setting a user with an empty password is a startup error — it would authenticate as nobody and fail at the first send. |
| `HEARTH_DEPLOY` | unset | Set to `image` by the GHCR compose files. Marks this as the prebuilt-image deploy so the in-app update UI shows `pull`-based commands and (with the host updater) one-click / automatic updates. Any other value means build-from-source. See [Updating](#updating--three-ways). |
| `HEARTH_COMPOSE_FILE` | inferred | The compose file the in-app update card names in its copy-paste commands. Left unset, Hearth infers it from `HEARTH_DEPLOY` and `DATABASE_URL` (one of the four shipped files). Set it when you run a different one — `docker-compose.public.yml` sets it to itself. The host updater reads the same variable on the host side. |
| `HEARTH_UPDATE_DIR` | `<data>/updates` | Directory the app and host updater exchange update control files in (request / result / heartbeat). Defaults next to the data dir; override only if you relocate that exchange. |
| `HEARTH_UPDATE_CHECK` | unset | Set to `off` to stop the release check contacting `api.github.com` at all — the app's only outbound request. Useful on an instance that should make none, and in tests, where a result depending on this repo's release history (or on GitHub being up) isn't deterministic; the e2e suite sets it. Any other value leaves the check on. Switched off it reports exactly what being offline reports, so the update banner stays hidden. |
| `HEARTH_UPDATE_TOKEN` | unset | GitHub token the update check uses to read the latest release. Only needed when your repo is **private**: GitHub 404s an unauthenticated request to a private repo's releases, so the in-app check silently reports no update. Needs **read only** (`contents: read` / classic `repo`), never write. Falls back to `HEARTH_FEEDBACK_TOKEN` when that's set against the same repo. Public repos need neither. |
| `HEARTH_FEEDBACK_TOKEN` | unset | A GitHub token with **issues: write** on the target repo. Setting it turns on the in-app **Send feedback** entry (in the account menu), which files a bug/idea as a GitHub issue. Left unset, the feature is hidden. Use a **fine-grained** token scoped to just the one repo, and remember reports land in a **public** repo — the form warns submitters. |
| `HEARTH_FEEDBACK_REPO` | `chrislynch97/hearth` | `owner/repo` that in-app feedback is filed against. Defaults to upstream (send reports to the project); point it at your own fork if you'd rather keep them. Only used when `HEARTH_FEEDBACK_TOKEN` is set. |

Hearth auto-detects HTTPS from `x-forwarded-proto: https` (or a direct HTTPS
connection) and marks the session cookie `Secure` accordingly; `HEARTH_SECURE_COOKIES=1`
is the manual override for proxies that don't set that header. When you front Hearth
with a single proxy or tunnel, also set `HEARTH_TRUST_PROXY=1` (the hop count) so the
rate limiter sees the real client IP rather than the proxy's. Configure that proxy to
**overwrite** `X-Forwarded-For` with the connecting client's address — if it appends
instead, a client-supplied header value survives and can be used to spoof the IP.

Forgetting `HEARTH_TRUST_PROXY` behind a proxy is silent and costs you three things
at once: every request looks like it came from the proxy, so the per-IP login limiter
throttles the entire internet as one client (ten bad guesses from anyone locks
everyone out for 15 minutes), the session cookie never gets `Secure` because
`x-forwarded-proto` is only believed from a trusted proxy, and every session and audit
entry records the proxy's address instead of the real one. Nothing about the running
instance looks wrong. `HEARTH_PUBLIC=1` therefore makes an unset value a startup
error; if you genuinely have no proxy, set `HEARTH_TRUST_PROXY=0` to say so.

---

## Email (optional)

Off by default. A LAN install has no relay and doesn't need one: invites are
copy-a-link, and a lost owner password is recovered on the box with
`reset-owner-password`. Configure a relay and three flows switch on —
**invite-by-email**, **address confirmation**, and **self-service password
reset**. A hosted or invite-only public deploy wants all three; the CLI reset
doesn't scale past the one person with shell access.

```env
HEARTH_MAIL_TRANSPORT=smtp
HEARTH_MAIL_FROM=Hearth <hearth@example.com>
HEARTH_PUBLIC_URL=https://hearth.example.com
HEARTH_SMTP_HOST=smtp.example.com
HEARTH_SMTP_USER=apikey
HEARTH_SMTP_PASS=<the relay password>
```

Any transactional provider works — the relay just has to speak SMTP. Use a
dedicated sending credential scoped to one sender, not your own mailbox login.

Hearth reports what it resolved at startup (`[hearth] email via smtp …`), so a
config that didn't take is visible in the first ten lines of the log rather than
at the first invite. A relay that's enabled but broken is fatal at boot, not
silently ignored.

**What the design guarantees**

- **Tokens never reach a log.** Every emailed link carries its token in the URL
  *fragment*, which browsers don't send to servers — so it can't land in Hearth's
  request log or a reverse proxy's access log (#176). The audit trail records
  that a link was sent, never the link.
- **Only confirmed addresses get a reset.** An address typed into a profile form
  or onto an invite is unproven; until someone clicks a confirmation link sent to
  it, `requestPasswordReset` mails nothing. A typo can't hand recovery to a
  stranger who happens to own that address.
- **Reset requests are silent.** The endpoint answers identically whether the
  account exists, has an address, or has a confirmed one — otherwise it's an
  account-enumeration oracle. What actually happened is in the log and the audit
  trail, where only you can see it.
- **A reset doesn't sign anyone in.** It sets the password, revokes every
  session, and sends the person to the login screen — so two-factor
  authentication still applies and a reset can't be used to step around it.
- **TLS is not optional by accident.** `HEARTH_SMTP_TLS=starttls` (the default)
  refuses to send when the relay doesn't offer STARTTLS.

**Trying it without a relay:** `HEARTH_MAIL_TRANSPORT=log` prints each message to
the server log instead of sending it, so you can follow the links by hand. That
means live tokens in the log, so it's development-only — `HEARTH_PUBLIC=1`
refuses to start with it set.

### Setting it up, start to finish

**1. Pick a relay.** Any transactional provider (Postmark, Resend, Mailgun,
Brevo, Amazon SES…) — all have free tiers far above what Hearth sends, which is
a handful of messages a *year*: invites, one confirmation per person, the
occasional reset.

Note that some privacy-focused mail hosts — **Tuta and Proton among them** —
don't offer SMTP at all, by design, because it's incompatible with their
end-to-end encryption. If that's where your mail lives, it can still *receive*
everything Hearth sends; it just can't be the thing that sends it.

**2. Send from a subdomain.** Use `mail.<your-domain>` (or similar) rather than
the domain your personal mail already uses:

```env
HEARTH_MAIL_FROM=Hearth <hearth@mail.example.com>
```

Your existing mail host keeps the root domain's SPF/DKIM records untouched, the
relay gets the subdomain, and neither can break the other. It also keeps Hearth's
sending reputation separate from your own correspondence. Point the subdomain's
DNS at the provider using the records they give you.

**One address is enough.** `HEARTH_MAIL_FROM` is a single value applied to every
message — there's no per-flow sender, and splitting one out would need a code
change. It would buy nothing anyway: deliverability reputation is per *domain*,
not per mailbox, so `invites@` and `security@` on the same subdomain are
indistinguishable to a receiving server. Decide only whether replies should go
anywhere: on most providers the sending address isn't a real mailbox, so either
name it `noreply@` or set up forwarding for it.

**3. Prove the flows locally first.** Before touching DNS, run with
`HEARTH_MAIL_TRANSPORT=log` and walk an invite, a confirmation and a reset,
following the links out of the server log. Catches template and URL problems
without a relay in the loop.

**4. Turn it on, and check the startup line.** After deploying, the log's first
few lines should read `[hearth] email via smtp <host>:<port> (starttls), from …,
links point at …`. If `HEARTH_PUBLIC_URL` is wrong, every link you send goes to
the wrong host — this is where you notice.

**5. Confirm the owner's address immediately.** Settings → Account → *Send
confirmation email*. Do this while you're still set up to fix problems: until
that address is confirmed, `requestPasswordReset` will mail you nothing, and
you're still on the `reset-owner-password` CLI path — which on a VPS means an
SSH session. Everything else here can wait; this shouldn't.

---

## Account recovery

Who can get an account back into someone's hands, when they forget the password:

| Account | Route |
|---|---|
| Instance owner | `reset-owner-password` on the box (shell access) |
| Member of exactly one household | A household admin, via Settings → Households & access |
| Member of more than one household | A confirmed email address, and nothing else |

That last row is why `HEARTH_PUBLIC=1` makes an address compulsory. An admin
reset deliberately refuses a person who belongs to more than one household —
resetting lets the resetter *learn* the password, which would hand one
household's admin the keys to another. So for those accounts a confirmed address
is the only route there is, and without one nobody can recover them: not an
admin, not the person themselves, not you without opening a SQL prompt.

On a public instance Hearth therefore:

- **asks for an address** when someone registers or accepts an invite, and sends
  the confirmation link with it;
- **refuses to let it be cleared** afterwards (changing it is fine — the new one
  goes back to unconfirmed until it's clicked);
- **nudges** accounts that predate this with a dismissible banner, rather than
  locking anyone out of their own finances to make the point.

None of this applies on a LAN install, where username-only accounts stay
perfectly legal and you can always reach a shell.

> Turn email on **before** you invite anyone. An address that's set but not
> confirmed is barely better than none — `requestPasswordReset` only ever mails a
> confirmed one — so an instance collecting addresses it can't send to is
> building the paperwork without the exit.

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
# Object storage — S3, Cloudflare R2, Backblaze B2, MinIO, anything S3-compatible:
HEARTH_BACKUP_OFFSITE=s3
HEARTH_BACKUP_S3_ENDPOINT=https://hearth-backups.s3.eu-west-2.amazonaws.com
HEARTH_BACKUP_S3_BUCKET=hearth-backups
HEARTH_BACKUP_S3_REGION=eu-west-2
HEARTH_BACKUP_S3_ACCESS_KEY_ID=<key>
HEARTH_BACKUP_S3_SECRET_ACCESS_KEY=<secret>
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>

# ...or copy each backup to a second mounted volume:
HEARTH_BACKUP_OFFSITE=directory
HEARTH_BACKUP_DIR=/mnt/backup-drive/hearth
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>

# ...or POST each backup to an endpoint (presigned S3 URL, your own collector):
HEARTH_BACKUP_OFFSITE=webhook
HEARTH_BACKUP_WEBHOOK_URL=https://example.com/hearth-backup
HEARTH_BACKUP_WEBHOOK_AUTH=Bearer <token>      # optional
HEARTH_BACKUP_PASSPHRASE=<a long random passphrase>
```

`HEARTH_BACKUP_S3_ENDPOINT` decides how requests are addressed: if the bucket name
is already the start of the hostname, Hearth signs virtual-hosted requests (what
AWS wants); otherwise it signs path-style (what MinIO and most self-hosted gateways
want). For Cloudflare R2 set the region to `auto`. `HEARTH_BACKUP_S3_PREFIX` puts
the objects under a key prefix, so one bucket can hold several instances.

By default off-site upload is **best-effort**: the local backup is written, verified
and kept regardless, and an off-site failure is logged (and surfaced on **Settings →
Data → Back up now**) but never fails or blocks the local backup. Keep the
passphrase somewhere separate from the backups — you need it to restore.

`HEARTH_BACKUP_KEEP` now applies to the off-site store as well as the local one, for
targets Hearth can enumerate (`s3`, `directory`). A `webhook` target is write-only —
there's no verb to list or delete with — so its retention stays the receiving
service's job (an S3 lifecycle rule, say).

**Restoring an off-site copy.** For an `s3` or `directory` target, restore in the
app: **Settings → Data → Restore from off-site** lists what's stored, and the server
fetches and decrypts the one you pick. Otherwise (or from a machine that isn't the
instance) decrypt the `*.json.enc` file back to a normal Hearth JSON snapshot and
import it from **Settings → Data → Import**:

```bash
HEARTH_BACKUP_PASSPHRASE=<passphrase> npm run backup:decrypt -- backup.json.enc
```

### Making off-site the primary store

On a host whose disk doesn't survive a redeploy — a container platform with
ephemeral storage, or any setup where `./data` isn't a real volume — a "successful"
local backup is worthless, and worse, it *looks* fine. Set:

```bash
HEARTH_BACKUP_PRIMARY=offsite
```

and the off-site copy becomes the backup rather than a supplement:

- Hearth **refuses to start** unless a working off-site target is configured, rather
  than falling back to a disk it's about to lose.
- A failed upload **fails the whole backup**: the household is left due so the next
  hourly tick retries, the backup heartbeat fails, and the `backup_failed` alert
  fires. Nothing is marked as backed up until the durable copy has actually landed.
- Older copies are only pruned **after** a successful upload, so a bad run can never
  evict the good ones.
- The local file becomes short-lived staging (only the newest is kept). It's still
  written and still restore-verified — that round-trip is how a backup proves itself
  — it just isn't what you'd restore from.

Use `s3` for this. A `directory` target on an ephemeral host is the same disk with
extra steps, and `webhook` gives you no way to get the data back through the app.

---

## Monitoring & alerting

On an unattended instance nothing tells you something broke — you find out when
you next open the app, which for a backup failure can be months too late. Hearth
ships the small pieces that fix that; all of them are opt-in except the health
endpoints.

Deliberately *not* included: metrics stacks (Prometheus/Grafana) and tracing.
Overkill for a single household box.

### Health endpoints

| Endpoint | Checks | Use for |
|---|---|---|
| `/health` | Nothing — 200 as soon as the process is listening. | Container/orchestrator liveness. |
| `/healthz` | Database answers a query, and the data volume has at least `HEARTH_DISK_MIN_FREE_MB` free. 200 when healthy, **503** when degraded. | An external uptime monitor. |

A full disk is the likeliest silent failure on a small VPS — the database
directory and the local backups both grow on local disk — so `/healthz` watches
it. Both endpoints are unauthenticated, so the `/healthz` body is booleans only
(`{"status":"degraded","checks":{"db":{"ok":true},"disk":{"ok":false}}}`); the
free-space figures and error text go to the container log instead.

### Uptime checks

Point a free external monitor ([UptimeRobot](https://uptimerobot.com),
[Healthchecks.io](https://healthchecks.io), Better Stack, …) at
`https://<your-host>/healthz` every 5 minutes and have it alert on a non-200. It
must be **external** — a monitor running on the same box goes down with it.

If your instance isn't reachable from the internet, invert it: run the check
locally on a cron and have it ping a Healthchecks.io check on success, so
silence raises the alarm.

### Backup failure alerting

Set `HEARTH_BACKUP_HEARTBEAT_URL` to a Healthchecks.io (or equivalent) ping URL.
Hearth pings it after each successful automatic backup, and pings `<url>/fail`
when one fails. Set the check's period to match your backup frequency (daily
backups → a 1-day period with a few hours' grace); the service then alerts both
when a backup fails *and* when one silently stops happening.

Set `HEARTH_ALERT_WEBHOOK` as well (or instead) to receive the same failures as
a JSON `POST` you can route wherever you already get notified.

### Failed-login alerting

Every failed sign-in is already recorded in the audit trail, but nobody reads a
table on an unattended box. Hearth sweeps the last hour and raises an
`auth_failures` alert (log line, plus `HEARTH_ALERT_WEBHOOK` if set) once
failures cross `HEARTH_AUTH_ALERT_THRESHOLD` (default 10). Set it to `0` to turn
the check off — worth doing on a LAN-only instance, where a fat-fingered
password is the only thing it will ever catch.

### Where to send alerts

`HEARTH_BACKUP_HEARTBEAT_URL` and `HEARTH_ALERT_WEBHOOK` both take any URL,
because Hearth deliberately implements no notification *policy* — no
deduplication, no escalation, no quiet hours. Point them at something that
already does all three. A setup that covers both failure classes:

```env
HEARTH_BACKUP_HEARTBEAT_URL=https://hc-ping.com/<check-uuid>
HEARTH_ALERT_WEBHOOK=https://ntfy.sh/<long-random-topic>
```

The two are not interchangeable, and it's worth knowing why:

- **The heartbeat catches silence.** It's the only thing that notices Hearth
  stopped running at all — a dead process raises nothing, so the absence of a
  ping *is* the signal. This needs a service that watches for it
  ([Healthchecks.io](https://healthchecks.io) or equivalent); a push service
  cannot do it, by construction.
- **The webhook catches events.** Backup and off-site failures, failed-login
  bursts. A push target like [ntfy](https://ntfy.sh) is ideal here — it reaches
  your phone in seconds and needs no account.

**Two things to know about ntfy specifically.** Alerts arrive titled
`Hearth: <event>`, and backup failures arrive at `high` priority, because Hearth
sends ntfy's `X-Title` and `X-Priority` headers alongside the JSON (any other
webhook target ignores them). The notification *text*, though, is whatever's in
the request body — so it shows the raw `{"event":…,"message":…}` under that
title. Readable, but not pretty. And a topic on the public instance is readable
by anyone who guesses its name: the payloads carry error text (which can include
file paths and database errors) and failed-login counts, which is a running
commentary on your instance and when it's being probed. Use a long random topic
name at minimum, ntfy's access control or a self-hosted instance ideally.

**Why not email, now that Hearth can send it?** [Email](#email-optional) is for
messages a *person* asked for and is waiting on. Machine-generated alerts stay
on the webhook for three reasons:

1. The failures you most need to hear about — disk full, database unreachable,
   network or relay down — are exactly the ones that stop an email going out.
   `sendAlert` is best-effort and swallows its own failures, so a lost alert is
   silent.
2. Alerts would share a relay credential, quota and sender reputation with
   password reset. A burst that trips a rate limit or gets the sender flagged
   would take account recovery down with it, and you'd find out when someone
   couldn't get back into their account.
3. Whatever you point the webhook at already does dedup and escalation properly,
   and can email you itself if that's what you want.

### Log rotation

Container logs are capped in the shipped compose files (`json-file`, 10 MB × 3
per service) so they can't fill the disk. If you run Hearth some other way, cap
them yourself — `docker run --log-opt max-size=10m --log-opt max-file=3`, or
under systemd set `SystemMaxUse=` in `journald.conf`.

**What's in the log.** Hearth logs one line per request with the method, URL,
status and client IP — no request bodies, no cookies, no session tokens. Invite
tokens are stripped from URLs before they're written, and invite links carry the
token in the URL's `#fragment` (which browsers never send to a server) so it
never arrives in the first place. Nothing else in the log is a credential, but it
is a record of who used the instance and when: if you ship logs off the box (a
provider's log console, journald forwarding, an aggregator), that record ends up
somewhere with a wider audience and a longer retention than the database.

---

## Auto-restart & updates

| | Docker | Node |
|---|---|---|
| Restart on crash | `restart: unless-stopped` (compose) | `Restart=always` (systemd) |
| Start after reboot | `restart: unless-stopped` | `systemctl enable` |
| Update Hearth | `git pull && docker compose up -d --build` | `git pull && npm install && npm run build && systemctl restart hearth` |

Hearth also checks GitHub for new releases and shows an **update banner** and a
**System settings → Updates** card (instance owner only). How you *apply* an
update depends on how you deploy:

### Updating — three ways

> **Updating the image does not update your compose file.** A pull replaces the
> image and leaves the compose file exactly as you copied it, so any `HEARTH_*`
> variable added since then exists in the app but is never passed into the
> container — setting it in `.env` does nothing, silently. Re-copy the compose
> file from [the release you're running](https://github.com/chrislynch97/hearth/releases)
> whenever you update, keeping any changes you made to it, then
> `docker compose … up -d`. Building from source (option 1) does this for you:
> `git pull` refreshes the compose file alongside the code.
>
> Hearth won't let this stay invisible — it logs a warning at startup, and shows
> one in **Settings → System → Updates**, naming every setting your compose file
> is missing. The updater deliberately doesn't rewrite the file for you: it's
> yours to edit (ports, volumes, extra services), and silently overwriting an
> operator's customisations is worse than telling them what to re-copy.

**1. Build from source (the default).** With `docker-compose.yml` /
`docker-compose.postgres.yml` you build the image locally, so updating is the
`git pull && docker compose up -d --build` above. The in-app card shows you the
exact commands for your setup. Nothing else to install.

**2. Managed image (prebuilt).** Switch to the GHCR image variant so updating is a
*pull* instead of a rebuild:

```bash
docker compose -f docker-compose.ghcr.yml up -d          # PGlite
# or: docker compose -f docker-compose.postgres.ghcr.yml up -d
```

These set `HEARTH_DEPLOY=image`. To update, `… pull` then `… up -d` — or enable
one-click / automatic updates with the host updater below. Images are published to
`ghcr.io/chrislynch97/hearth` on every release; `:latest` tracks the newest.

**3. One-click & automatic (managed image + host updater).** A tiny host script
does the pull + recreate when the app asks — so **Update now** and scheduled
auto-updates work from inside the app. **The Hearth container never gets Docker
access**; it only writes a request file into `./data/updates`, and the host
updater (running on the host) acts on it. The runner is refreshing a heartbeat
that the app treats as "managed updates active"; each tick it also applies any
pending request. Pick the runner for your host OS.

*Linux — systemd (or cron).*

```bash
# From your Hearth install dir (holds the compose file + ./data):
sudo cp scripts/hearth-updater.sh /opt/hearth/scripts/    # or wherever you cloned
sudo cp deploy/hearth-updater.service deploy/hearth-updater.timer /etc/systemd/system/
sudoedit /etc/systemd/system/hearth-updater.service       # set HEARTH_PROJECT_DIR + compose file + User
sudo systemctl daemon-reload
sudo systemctl enable --now hearth-updater.timer
```

The timer runs every ~30s. The runner user must be in the `docker` group. Not on
systemd? A cron line does the same:

```cron
* * * * * cd /opt/hearth && HEARTH_COMPOSE_FILE=docker-compose.ghcr.yml scripts/hearth-updater.sh >> /var/log/hearth-updater.log 2>&1
```

*Windows / Docker Desktop — Task Scheduler.* There's no systemd, so register the
PowerShell updater (`scripts/hearth-updater.ps1`) as a scheduled task instead. In
your Hearth install dir, either **double-click `deploy\register-hearth-updater.cmd`**,
or from a normal PowerShell (no admin needed):

```powershell
.\deploy\register-hearth-updater.ps1
```

That's it — the compose file is auto-detected from the running project (pass
`-ComposeFile docker-compose.postgres.ghcr.yml` to override). The task runs every
minute — hidden, via `wscript`, so no console window flashes — which is Task
Scheduler's minimum and well within the app's 3-minute heartbeat window. Run it as
a user in the **docker-users** group who's signed in to Docker Desktop, so
`docker compose` can reach the engine. Remove it with
`Unregister-ScheduledTask -TaskName Hearth-Updater -Confirm:$false`.

Both runners refresh the heartbeat so the app shows the **Update now** button and
enables **Install updates automatically**, then apply any pending request — the
flag-file contract in `./data/updates` is identical across OSes.

**Backups first.** *Back up before updating* is on by default (Settings →
Updates), so every applied update writes a verified backup first. *Install updates
automatically* lets you pick a daily time (or apply as soon as one is found).

> **GHCR image visibility.** Packages are **private** by default. To pull without
> authenticating, make the package public once: GitHub → your profile → Packages →
> `hearth` → Package settings → Change visibility → Public.

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

**Remote access (outside your home).** Three options, least exposed first:

- **VPN back into your LAN** — e.g. WireGuard or Tailscale. Then `hearth.lan:8787`
  just works remotely. Private and simple; ideal for a finance app, and the right
  answer whenever everyone who needs access will run a VPN client.
- **Cloudflare Tunnel** — a public HTTPS URL with no port-forwarding, keeping the
  app on a machine at home. Set `HEARTH_PUBLIC=1` and `HEARTH_TRUST_PROXY=1`: the
  instance is internet-facing even though the box isn't.
- **A public URL on a VPS you rent** — no home machine and no VPN client needed.
  Follow [Option C](#option-c--public-vps-under-your-own-domain), which covers the
  TLS proxy and the configuration a public address needs.

---

## HTTPS & security

- **Accounts & login.** Hearth has per-user accounts. A fresh install auto-creates
  an **owner** account with no password, so the app is **open** on your network with
  no login (fine on a trusted LAN; not for public exposure). Set a password on your
  account (**Settings → Security**) to turn login on — from then on everyone signs in
  with their own username + password. Passwords must be at least 10 characters and
  very common ones are rejected.
- **Tell Hearth it's public** by setting `HEARTH_PUBLIC=1` on anything reachable from
  the internet. A config mistake is the likeliest way a self-host gets exposed, so
  Hearth checks its own configuration on every boot and, with this set, **refuses to
  start** instead of coming up in a state that would serve your finances to strangers
  (a stray `HEARTH_ALLOW_OPEN=1`, or open registration with no owner password) or one
  where it can't defend itself properly (`HEARTH_TRUST_PROXY` unset behind a proxy —
  see [Configuration](#configuration-reference)). It costs nothing when the config is
  right, and turns a silent exposure into an obvious failure. Without it the first two
  only warn and the third isn't checked — which is what a home LAN wants.
- **Invite others with roles** (**Settings → Households & access**). An admin creates
  a single-use invite link (expires in 7 days); the recipient opens it, picks a
  username + password, and joins. Roles: **owner** (full control), **admin** (manage
  settings & invite), **member** (edit budgeting data), **viewer** (read-only). Only
  the owner can remove the password / reopen the instance, and only while they're the
  sole account. For those 7 days the link **is** the credential — anyone holding it
  can create an account in your household — so send it over something private rather
  than a shared channel or a ticket. The token rides in the URL's `#fragment`, which
  browsers never send to the server, keeping it out of Hearth's request log and your
  reverse proxy's access log alike. If you shared a link in the older
  `/invite/<token>` form, your proxy's access log may still hold it: revoke that
  invite from the same screen and issue a fresh one.
- **Manage who has access** from the same screen: change a member's role, revoke
  access, or reset a locked-out member's password (there's no email-based reset on a
  self-host). Guardrails apply — you can't change or remove yourself, an admin can
  only manage members/viewers, the last owner can't be removed, and you can't reset
  the password of someone who also belongs to another household.
- **Sign everyone out at once** (**Settings → System → Sessions**, instance owner
  only) when you suspect a session or a backup has been exposed and don't yet know
  whose. It ends every session on the instance, yours included, and changes nothing
  else — so anyone who still has their credentials signs straight back in, and you
  follow it with password changes where they're implicated. `npm run
  end-all-sessions` (or `docker compose exec hearth node dist/end-all-sessions.js`)
  does the same from the box, including on the embedded database, for when the app
  won't start. Both are recorded in the audit log; the
  [breach runbook](legal/breach-runbook.md) has the surrounding drill.
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
- **Login is rate-limited** — 10 attempts / 15 min per client IP *at a given
  account*, 30 / 15 min for that client across all accounts, plus a looser
  per-account cap (50 / 15 min) that catches a distributed brute-force of one
  account without letting a single client lock a victim out. The tight cap is the
  pair, not the address, so one person guessing at one account can't block
  everyone else behind the same NAT or VPN exit from signing in. **Self-registration**
  is likewise capped (10 / hour per client) so an open instance can't be spammed
  into mass-creating households. Behind a proxy, set `HEARTH_TRUST_PROXY` to the hop
  count (a single proxy = `1`) so the per-IP limit keys on the real client IP, not
  the proxy — and make the proxy overwrite `X-Forwarded-For`. Limiter state lives in
  the database, so it survives a restart and is shared by every instance running
  against that database — running two replicas doesn't double the attempt budget.
- **The database is not encrypted at rest.** Password hashes, TOTP secrets and
  recovery-code hashes live in the same database as your data, so two-factor
  protects the *login path*, not someone who already has the files. Keep the data
  directory (and your backups) on trusted storage.
- **Financial data on a device you own** is the intended posture, and a VPN back to
  it beats a public URL where it's practical. Where it isn't, put the instance on a
  public address deliberately rather than by accident:
  [Option C](#option-c--public-vps-under-your-own-domain) is the walkthrough, and
  every bullet above is part of it.
- **Know what you'd do if it went wrong**, before it does.
  [legal/breach-runbook.md](legal/breach-runbook.md) is the procedure for a leak —
  what counts, which logs to preserve first (several rotate away or die on
  restart), every credential to rotate and where it lives, and who to tell.
  Read it once now; it's written for someone who hasn't.

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
