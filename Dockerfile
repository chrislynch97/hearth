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

ENV PORT=8787
ENV DATABASE_URL=file:/data/app.db
ENV CLIENT_DIR=/app/dist/client
EXPOSE 8787

# Server runs via tsx; applies migrations + seed on boot, then serves API + built client.
CMD ["npm", "run", "start"]
