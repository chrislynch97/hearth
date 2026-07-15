import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: { outDir: 'dist/client' },
  server: {
    port: 5173,
    proxy: {
      '/trpc': {
        target: 'http://localhost:8787',
        // The server rejects cross-origin writes (#50) by comparing Origin
        // against Host. In dev the SPA is served from :5173 while the API lives
        // on :8787, so the browser's `Origin: …:5173` never matches the API and
        // every mutation would 403. Present the proxied request as same-origin:
        // `changeOrigin` rewrites Host to the target, and `headers` rewrites the
        // Origin to match it. Dev-only — in production the SPA and the API are
        // genuinely the same origin and neither is needed.
        changeOrigin: true,
        headers: { Origin: 'http://localhost:8787' },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Each server test spins up a fresh in-memory PGlite (real Postgres in WASM)
    // and applies the baseline migration — a heavier per-test setup than the old
    // in-memory SQLite, so give tests more headroom than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
