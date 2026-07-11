import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client' },
  server: {
    port: 5173,
    proxy: { '/trpc': 'http://localhost:8787' },
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
