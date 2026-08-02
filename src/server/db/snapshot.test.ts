import { describe, it, expect } from 'vitest'
import type { PgTable } from 'drizzle-orm/pg-core'
import { makeTestDb } from './testdb'
import { seedDemo } from './demo'
import { ALL_TABLES } from './tables'
import { billingEvent, household, subscription } from './schema'
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

describe('entitlement is outside the portability contract (#232)', () => {
  /** Subscribe the household seedDemo created, and return its id. */
  async function subscribeSeededHousehold(db: DB, status: string): Promise<string> {
    const rows = await db.select({ id: household.id }).from(household)
    const householdId = rows[0]!.id
    await db.insert(subscription).values({
      householdId,
      provider: 'paddle',
      plan: 'household',
      status,
      updatedAt: new Date(NOW),
    })
    return householdId
  }

  it('is never exported', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })
    await subscribeSeededHousehold(db, 'active')

    const snapshot = await buildSnapshot(db)

    expect(snapshot.tables['subscription']).toBeUndefined()
    expect(snapshot.tables['billingEvent']).toBeUndefined()
  })

  it('cannot be created or altered by an import', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })
    const householdId = await subscribeSeededHousehold(db, 'past_due')

    const snapshot = await buildSnapshot(db)
    // A hand-edited export claiming a paid subscription and a webhook that never
    // arrived — the two ways an import could buy itself entitlement.
    await applySnapshot(db, {
      ...snapshot.tables,
      subscription: [
        { householdId, provider: 'paddle', plan: 'unlimited', status: 'active', updatedAt: NOW },
      ],
      billingEvent: [
        { id: 'evt', provider: 'paddle', providerEventId: 'e1', type: 'forged', receivedAt: NOW, payload: '{}' },
      ],
    })

    const rows = await db.select().from(subscription)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.plan).toBe('household')
    expect(rows[0]!.status).toBe('past_due') // the forged 'active' never landed
    expect(await db.select().from(billingEvent)).toEqual([])
  })

  it('does not survive a restore of some other instance, whose households it never covered', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })
    await subscribeSeededHousehold(db, 'active')

    const snapshot = await buildSnapshot(db)
    const foreign = snapshot.tables['household']!.map((h) => ({ ...h, id: 'other-instance' }))
    await applySnapshot(db, { household: foreign })

    expect(await db.select().from(subscription)).toEqual([])
  })
})
