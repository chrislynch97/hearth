// End-to-end smoke suite (#142). A canary, not a second test pyramid: it drives
// the *built* client against a real server so the classes of bug unit tests
// can't see — routing, tRPC wiring, the auth gates — fail loudly.
//
// It always runs against DEMO mode. `npm run demo` pins DATABASE_URL to the
// disposable demo database itself (scripts/demo-server.ts) and refuses anything
// that looks real (scripts/demo-guard.ts), so no env here can point the suite at
// the owner's data. Don't add `--force`.

import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// A port of its own, so a dev `npm run demo` on 8787 can keep running.
const PORT = Number(process.env.E2E_PORT ?? 8788)
const baseURL = `http://127.0.0.1:${PORT}`

// The suite exercises the built SPA, which the server only serves if it exists.
// Without this the failure is 20 identical "page is blank" timeouts.
const clientDir = resolve('dist/client')
if (!existsSync(resolve(clientDir, 'index.html'))) {
  throw new Error(`No built client at ${clientDir}. Run \`npm run build:client\` first (or \`npm run test:e2e\`, which does it for you).`)
}

export default defineConfig({
  testDir: './e2e',
  // One worker: every test shares the single seeded demo database, and one of
  // them writes to it. Serial keeps the suite deterministic — and it's small.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--seed` on every run: the suite adds a spend, so without a fresh seed the
    // second run starts from a different dataset than the first.
    command: 'npm run demo -- --seed',
    url: `${baseURL}/health`,
    env: {
      PORT: String(PORT),
      // Loopback bind: the server's open-access guard only fires off-box, and a
      // demo instance has no owner password.
      HOST: '127.0.0.1',
      CLIENT_DIR: clientDir,
      // No live release check: it calls api.github.com, so leaving it on makes
      // the suite's result depend on this repo's release history and on GitHub
      // being reachable. It also renders the update banner, which is a second
      // `role="alert"` on every page.
      HEARTH_UPDATE_CHECK: 'off',
    },
    // Never reuse: a server left over from a previous run has a mutated database.
    reuseExistingServer: false,
    // First run migrates + seeds a fresh PGlite database from scratch.
    timeout: 180_000,
    // Fastify logs every request; that buries the test output. Errors still show.
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
