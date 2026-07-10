// Run the Hearth server against the DEMO database, cross-platform (no shell env
// juggling). Sets DATABASE_URL to the demo file, seeds it if it's empty, then
// boots the normal server. The Vite dev client (`npm run dev:client`) proxies to
// it unchanged.
//
//   npm run demo          → serve the demo db (seeds it on first run)
//   npm run demo -- --seed → force a fresh re-seed before serving

import { looksLikeRealDb } from './demo-guard.ts'

const DEFAULT_DEMO_URL = 'file:./data/demo.db'
const reseed = process.argv.includes('--seed')
const forced = process.argv.includes('--force')

// Demo mode always runs against the disposable demo database. Force the demo
// path unconditionally (do NOT defer to an inherited DATABASE_URL with `??=`):
// otherwise a `DATABASE_URL` left pointing at the real app.db would be migrated,
// re-seeded (which wipes every table), and served — silently destroying the
// owner's real financial data. `--force` lets an explicit operator override stand.
if (!forced) process.env.DATABASE_URL = DEFAULT_DEMO_URL

// Belt-and-suspenders guard mirroring scripts/seed-demo.ts: refuse to touch
// anything that still looks like the real database.
const target = process.env.DATABASE_URL ?? DEFAULT_DEMO_URL
if (looksLikeRealDb(target) && !forced) {
  console.error(
    `Refusing to run demo mode against "${target}" — that looks like the real database.\n` +
      `Unset DATABASE_URL to use the default (${DEFAULT_DEMO_URL}), point it at a demo/test file, or pass --force.`,
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const { runMigrations } = await import('../src/server/db/migrate.ts')
  const { db } = await import('../src/server/db/client.ts')
  const { seedDemo, hasHousehold } = await import('../src/server/db/demo.ts')

  await runMigrations()
  if (reseed || !(await hasHousehold(db))) {
    console.log(`[demo] populating ${process.env.DATABASE_URL}`)
    await seedDemo(db)
  } else {
    console.log(`[demo] using existing demo data in ${process.env.DATABASE_URL} (pass --seed to refresh)`)
  }

  // Boot the real server. It re-uses the same DATABASE_URL we set above.
  await import('../src/server/index.ts')
}

main().catch((err) => {
  console.error('[demo] failed:', err)
  process.exit(1)
})
