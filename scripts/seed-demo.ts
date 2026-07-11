// Seed a dedicated DEMO database with fake data — never the real app.db.
//
//   npm run demo:seed                 → seeds ./data/demo.db
//   DATABASE_URL=... npm run demo:seed → seeds an explicit target
//
// Defaults DATABASE_URL to the demo file BEFORE importing the db client (which
// reads the env var at import time), so the real database is untouched. Runs
// migrations first, then wipes and repopulates.

// Point at the demo database unless the caller overrode it. Guard against
// accidentally seeding the real app.db — refuse unless it's clearly a demo/test
// target or the caller passes --force.
import { looksLikeRealDb } from './demo-guard'

const DEFAULT_DEMO_URL = 'pglite:./data/demo'
const forced = process.argv.includes('--force')
process.env.DATABASE_URL ??= DEFAULT_DEMO_URL

const target = process.env.DATABASE_URL
if (looksLikeRealDb(target) && !forced) {
  console.error(
    `Refusing to seed demo data into "${target}" — that looks like the real database.\n` +
      `Use the default (${DEFAULT_DEMO_URL}), point DATABASE_URL at a demo/test file, or pass --force.`,
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const { runMigrations } = await import('../src/server/db/migrate')
  const { db, closeDb } = await import('../src/server/db/client')
  const { seedDemo } = await import('../src/server/db/demo')

  console.log(`[demo] seeding ${target}`)
  await runMigrations()
  const counts = await seedDemo(db)

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log('[demo] inserted rows:')
  for (const [name, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${name.padEnd(22)} ${n}`)
  }
  console.log(`[demo] done — ${total} rows across ${Object.values(counts).filter((n) => n > 0).length} tables`)

  await closeDb()
}

main().catch((err) => {
  console.error('[demo] failed:', err)
  process.exit(1)
})
