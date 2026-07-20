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
    // Server tests reset and re-migrate a shared in-memory PGlite (real
    // Postgres in WASM) per test — heavier per-test setup than plain unit
    // tests, so give tests more headroom than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // jsdom boot is expensive per file; only client tests need a DOM.
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/client/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          setupFiles: ['./vitest.setup.server.ts'],
          include: ['src/{server,shared}/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
        },
      },
    ],
  },
})
