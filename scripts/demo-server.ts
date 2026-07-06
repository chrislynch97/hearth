// Run the Hearth server against the DEMO database, cross-platform (no shell env
// juggling). Sets DATABASE_URL to the demo file, seeds it if it's empty, then
// boots the normal server. The Vite dev client (`npm run dev:client`) proxies to
// it unchanged.
//
//   npm run demo          → serve the demo db (seeds it on first run)
//   npm run demo -- --seed → force a fresh re-seed before serving

const DEFAULT_DEMO_URL = 'file:./data/demo.db'
process.env.DATABASE_URL ??= DEFAULT_DEMO_URL
const reseed = process.argv.includes('--seed')

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
