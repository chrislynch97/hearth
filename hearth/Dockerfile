# Home Assistant add-on image. HA builds an add-on using only its own folder as
# the Docker context, so we can't COPY the app source (it lives at the repo root).
# Instead we clone + build the app here. A "Rebuild" in HA pulls the latest main.
FROM node:24-slim

# node:24-slim has no git; we need it to fetch the app.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Override to build a different branch/tag if ever needed.
ARG APP_REF=main

WORKDIR /app
# `npm install` (not `npm ci`) so the on-device build tolerates cross-platform
# lockfile drift — `npm ci` is strict and fails (EUSAGE) when the lockfile was
# generated on a different OS/arch (e.g. Windows dev) than this arm64 build.
RUN git clone --depth 1 --branch "${APP_REF}" https://github.com/chrislynch97/hearth.git . \
  && npm install --no-audit --no-fund \
  && npm run build \
  && npm cache clean --force

ENV PORT=8787
# HA auto-persists /data for add-ons, so the SQLite DB + JSON backups survive
# rebuilds and reboots.
ENV DATABASE_URL=file:/data/app.db
ENV CLIENT_DIR=/app/dist/client
EXPOSE 8787

# Applies migrations + seed on boot, then serves API + built client on one port.
CMD ["npm", "run", "start"]
