// One-time migration: copy a legacy SQLite `app.db` (the pre-Postgres Hearth
// database) into the new Postgres database, table for table.
//
//   npm run db:migrate-from-sqlite -- ./data/app.db
//
// The TARGET is whatever DATABASE_URL selects (see src/server/db/client.ts):
//   * unset            → embedded PGlite at ./data/pgdata (the self-host default)
//   * postgres://…     → a real Postgres server
// so set DATABASE_URL to your new database before running, e.g.
//   DATABASE_URL=postgres://user:pass@host/hearth npm run db:migrate-from-sqlite -- ./data/app.db
//
// How it works: it reads every portable table out of the SQLite file (via the
// built-in `node:sqlite`), remaps snake_case columns to the schema's field
// names, and runs the SAME import path the app's Settings → Import uses
// (`applySnapshot`) — which wipes the target and re-inserts, converting the
// epoch-millis timestamps into real `timestamptz` values. Safe to re-run.
//
// This exists because engine coupling was concentrated in the schema; the JSON
// export/import contract is engine-agnostic, so a SQLite export imports into
// Postgres unchanged. If you already have a JSON export from the old app, you
// can skip this script and just use Settings → Import instead.

import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'

const sqlitePath = process.argv[2] ?? './data/app.db'

async function main(): Promise<void> {
  if (!existsSync(sqlitePath)) {
    console.error(`No SQLite database at "${sqlitePath}". Pass the path: npm run db:migrate-from-sqlite -- ./data/app.db`)
    process.exit(1)
  }

  const { db, closeDb } = await import('../src/server/db/client')
  const { runMigrations } = await import('../src/server/db/migrate')
  const { ensureSeed } = await import('../src/server/db/seed')
  const { ALL_TABLES } = await import('../src/server/db/tables')
  const { applySnapshot } = await import('../src/server/db/snapshot')

  const target = process.env.DATABASE_URL ?? 'pglite:./data/pgdata (default)'
  console.log(`[migrate] source: ${sqlitePath}`)
  console.log(`[migrate] target: ${target}`)

  // Make sure the Postgres schema exists before we import into it.
  await runMigrations()

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true })
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  try {
    for (const [name, table] of ALL_TABLES) {
      const cols = Object.entries(getTableColumns(table))
      const sqlName = getTableName(table)
      const exists = sqlite
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`)
        .get(sqlName)
      if (!exists) {
        // An older app.db predating this table — treat as empty rather than erroring.
        tables[name] = []
        continue
      }
      const rows = sqlite.prepare(`SELECT * FROM ${sqlName}`).all() as Array<Record<string, unknown>>
      // Remap each SQLite column (snake_case) to the schema's JS field name, so
      // the row shape matches what `applySnapshot` inserts. Timestamps stay as
      // epoch-millis numbers here; applySnapshot converts them to Date/timestamptz.
      tables[name] = rows.map((r) => {
        const out: Record<string, unknown> = {}
        for (const [jsKey, col] of cols) out[jsKey] = r[col.name]
        return out
      })
    }
  } finally {
    sqlite.close()
  }

  const counts = await applySnapshot(db, tables)
  // Backfill instance-wide settings (owner pointer, auth-required flag) that live
  // outside the portable table set; idempotent, and won't duplicate the imported
  // owner user/membership.
  await ensureSeed(db)

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log('[migrate] imported rows:')
  for (const [name, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${name.padEnd(22)} ${n}`)
  }
  console.log(`[migrate] done — ${total} rows across ${Object.values(counts).filter((n) => n > 0).length} tables`)

  await closeDb()
}

main().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
