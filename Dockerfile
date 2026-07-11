FROM node:24-slim
WORKDIR /app

# Install all deps (incl. dev: tsx runs the server, vite builds the client).
# `npm install` (not `npm ci`) so the build tolerates cross-platform lockfile
# drift — `npm ci` is strict and fails (EUSAGE) when the lockfile was generated
# on a different OS/arch than the build host (e.g. Windows dev -> arm64 Pi).
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build        # builds the client into dist/client

ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_URL=pglite:/data/pgdata
ENV CLIENT_DIR=/app/dist/client
EXPOSE 8787

# The server exposes GET /health (no DB access) for orchestrators. `node -e`
# keeps the image dependency-free (node:slim ships no curl/wget).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node directly (not via `npm run start`) so SIGTERM reaches the process and
# the graceful-shutdown handler exits cleanly. Pair with `init: true` in
# docker-compose so a proper PID 1 forwards the signal.
# Applies migrations + seed on boot, then serves API + built client.
CMD ["node", "--import", "tsx", "src/server/index.ts"]
