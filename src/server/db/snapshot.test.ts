import { describe, it, expect } from 'vitest'
import type { PgTable } from 'drizzle-orm/pg-core'
import { makeTestDb } from './testdb'
import { seedDemo } from './demo'
import { ALL_TABLES } from './tables'
import { applySnapshot, buildSnapshot } from './snapshot'
import type { DB } from './client'

const NOW = Date.UTC(2026, 5, 15)

async function countRows(db: DB): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const [name, table] of ALL_TABLES) {
    counts[name] = (await db.select().from(table as PgTable)).length
  }
  return counts
}

/** Snapshot rows come back in physical order (no ORDER BY), which a re-insert
 *  reshuffles. Sort each table so the comparison is about content, not layout. */
function normalize(tables: Record<string, Array<Record<string, unknown>>>) {
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, [...rows.map((r) => JSON.stringify(r))].sort()]),
  )
}

describe('snapshot round trip', () => {
  it('restores every table it exported, row for row', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const before = await countRows(db)
    const snapshot = await buildSnapshot(db)
    await applySnapshot(db, snapshot.tables)
    const after = await countRows(db)

    // A table missing from ALL_TABLES is emptied by FK cascade and never
    // re-inserted, so its count silently drops to zero — issue #99, which only
    // showed up after a full export/import cycle like this one.
    expect(after).toEqual(before)
    expect(before['billPrice']).toBeGreaterThan(0) // the table #99 lost; keep it exercised
  })

  it('preserves row contents, not just counts', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const snapshot = await buildSnapshot(db)
    await applySnapshot(db, snapshot.tables)
    const restored = await buildSnapshot(db)

    expect(normalize(restored.tables)).toEqual(normalize(snapshot.tables))
  })
})
