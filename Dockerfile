FROM node:24-slim
WORKDIR /app

# Install all deps (incl. dev: tsx runs the server, vite builds the client).
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build        # builds the client into dist/client

ENV PORT=8787
ENV DATABASE_URL=file:/data/app.db
ENV CLIENT_DIR=/app/dist/client
EXPOSE 8787

# Server runs via tsx; applies migrations + seed on boot, then serves API + built client.
CMD ["npm", "run", "start"]
