// Regenerate the DEV database's fake households without starting the server.
//
//   npm run dev:seed                 → seeds ./data/dev
//   DATABASE_URL=... npm run dev:seed → seeds an explicit target
//
// Defaults DATABASE_URL to the dev database BEFORE importing the db client (which
// reads the env var at import time), so the real database is untouched. Runs
// migrations first, then wipes and repopulates.

import { looksLikeRealDb } from './demo-guard'

const DEFAULT_DEV_URL = 'pglite:./data/dev'
const forced = process.argv.includes('--force')
process.env.DATABASE_URL ??= DEFAULT_DEV_URL

// Guard against seeding the real database: refuse unless the target is clearly a
// dev/test one, or the caller passes --force.
const target = process.env.DATABASE_URL
if (looksLikeRealDb(target) && !forced) {
  console.error(
    `Refusing to seed dev data into "${target}" — that looks like the real database.\n` +
      `Use the default (${DEFAULT_DEV_URL}), point DATABASE_URL at a dev/test file, or pass --force.`,
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const { runMigrations } = await import('../src/server/db/migrate')
  const { db, closeDb } = await import('../src/server/db/client')
  const { seedDev, DEV_HOUSEHOLD_IDS, DEV_LOGIN, DEV_PASSWORD } = await import('../src/server/db/dev')

  console.log(`[dev] seeding ${target}`)
  await runMigrations()
  const counts = await seedDev(db)

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log('[dev] inserted rows:')
  for (const [name, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${name.padEnd(22)} ${n}`)
  }
  console.log(`[dev] done — ${total} rows across ${Object.values(counts).filter((n) => n > 0).length} tables`)
  console.log(`[dev] ${Object.keys(DEV_HOUSEHOLD_IDS).length} households; log in as ${DEV_LOGIN} / ${DEV_PASSWORD}`)

  await closeDb()
}

main().catch((err) => {
  console.error('[dev] failed:', err)
  process.exit(1)
})
