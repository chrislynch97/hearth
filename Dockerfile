# syntax=docker/dockerfile:1

# ---- Build stage: full toolchain (dev deps) to compile client + server ----
# Base image pinned by digest for reproducible builds; Dependabot bumps the
# digest (and node:24-slim tag) when a patched image is published. Keep both
# stages on the same digest.
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app

# Reproducible install from the committed lockfile. `npm ci` is strict, so keep
# package-lock.json in sync (it is — cross-arch drift shows up as EUSAGE).
#
# Note on the @emnapi/* pins in package.json's devDependencies: they exist solely
# to keep this build working. @rolldown/binding-wasm32-wasi (a dev-only, optional
# dep of Vite) pins @emnapi/core nested inside itself, while @napi-rs/wasm-runtime
# peer-requires it at a looser range. Resolving on Windows omits the top-level
# entry; Linux needs it, so `npm ci` here fails with
# "Missing: @emnapi/core@… from lock file". Re-resolving the lockfile does NOT
# fix it — an `npm install` on Windows strips the entry again. Declaring the
# packages directly makes the resolution deterministic on both platforms.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The running version, baked into dist/version.json (see scripts/gen-version.mjs).
# .git is dockerignored, so there's no git here to describe from — the release
# CI passes --build-arg HEARTH_VERSION=<tag>; a plain local build falls back to
# "unknown", which the in-app update check reports honestly.
ARG HEARTH_VERSION=""
ENV HEARTH_VERSION=$HEARTH_VERSION
# Vite bundles the client into dist/client; esbuild bundles the server (and the
# demo entrypoint) into self-contained dist/*.js with node_modules kept external.
RUN npm run build

# ---- Runtime stage: prod deps only, compiled JS, non-root ----
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies — no tsx/vite/esbuild/typescript in the image.
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Compiled JS + the Drizzle migrations the server applies on boot (resolved from
# CWD as ./drizzle). No TypeScript sources ship in the runtime image.
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

ENV PORT=8787
ENV DATABASE_URL=pglite:/data/pgdata
ENV CLIENT_DIR=/app/dist/client
EXPOSE 8787

# Run unprivileged. The node:slim image ships a `node` user (uid 1000). Give it
# ownership of the data volume (embedded PGlite + backups live here) and the app
# dir (so the postgres:// backup path, which writes ./data, also works).
RUN mkdir -p /data && chown node:node /app /data
USER node

# The server exposes GET /health (no DB access) for orchestrators. `node -e`
# keeps the image dependency-free (node:slim ships no curl/wget).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node directly on the compiled bundle so SIGTERM reaches the process and the
# graceful-shutdown handler exits cleanly. Pair with `init: true` in
# docker-compose so a proper PID 1 forwards the signal.
# Applies migrations + seed on boot, then serves API + built client.
CMD ["node", "dist/server/index.js"]
