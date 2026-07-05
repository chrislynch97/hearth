# Hearthledger

Private household finance tracker, running as a Home Assistant add-on.

## Install

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**.
2. Top-right **⋮ → Repositories**, paste `https://github.com/chrislynch97/hearth`, and **Add**.
3. Find **Hearthledger** in the store and click **Install**. The first build takes
   a few minutes (it compiles the app on-device).
4. **Start** the add-on. Use **Open Web UI**, or browse to `http://<ha-host>:8787`.

## Data

Everything lives in the add-on's persistent `/data` directory:

- `app.db` — the SQLite database
- `backups/` — automatic JSON backups

This survives restarts, reboots, and add-on rebuilds. To back up, use the
in-app **Settings → Data → Export**, or copy `/data` off the host.

## Updates

Push changes to `main`, then open the add-on and click **Rebuild** (it re-clones
`main`). Bump `version` in `config.yaml` to get Home Assistant's **Update**
prompt instead.

## Access

- Locally: `http://<ha-host>:8787` (e.g. `http://homeassistant.local:8787`).
- Custom name: add a local DNS record on your router (e.g. `hearth.lan → <Pi IP>`).
  Avoid `.local` (reserved for mDNS).
- Remote: reach it over a VPN back into your LAN (e.g. UniFi Teleport). Nabu Casa
  Cloud does **not** proxy this add-on, since it uses a direct port rather than
  Ingress.

## Security

Set a shared password in **Settings → Security** once you're up and running.
