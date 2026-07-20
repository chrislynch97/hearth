import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { makeTestDb } from './testdb'
import { SchedulerLock, withLeaderLock } from './leader'
import type { DB } from './client'

/** A `DB` stand-in for a *pooled* engine (real Postgres), which is the only
 *  place election happens — a single PGlite connection can't produce concurrent
 *  transactions for real. `locked` reports the lock as already taken by another
 *  replica; `sql` collects the statements the helper issued. */
function pooledDb(locked = false): DB & { sql: string[] } {
  const seen: string[] = []
  return {
    sql: seen,
    transaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        execute: async (query: { queryChunks?: unknown[] }) => {
          seen.push(JSON.stringify(query.queryChunks ?? query))
          return { rows: [{ locked: !locked }] }
        },
      }),
  } as unknown as DB & { sql: string[] }
}

describe('withLeaderLock', () => {
  it('runs the work and reports itself leader when the lock is free', async () => {
    const db = await makeTestDb()
    let ran = 0

    const won = await withLeaderLock(db, SchedulerLock.backup, async () => {
      ran += 1
    })

    expect(won).toBe(true)
    expect(ran).toBe(1)
  })

  // Issue #149: the work used to run against the pooled `db` while a transaction
  // held PGlite's only connection, so any query inside `work` deadlocked the
  // whole database at boot. Empty `work()` bodies hid it — this one must query.
  it('lets the work query the database without deadlocking on PGlite', async () => {
    const db = await makeTestDb()
    let rows = 0

    const won = await withLeaderLock(db, SchedulerLock.sessionPurge, async () => {
      const result = await db.execute(sql`select 1 as one`)
      rows = result.rows.length
    })

    expect(won).toBe(true)
    expect(rows).toBe(1)
  })

  it('leaves the database usable for the next tick', async () => {
    const db = await makeTestDb()
    const query = async () => {
      await db.execute(sql`select 1`)
    }

    expect(await withLeaderLock(db, SchedulerLock.backup, query)).toBe(true)
    expect(await withLeaderLock(db, SchedulerLock.backup, query)).toBe(true)
  })

  it('leaves the database usable even when the work throws', async () => {
    const db = await makeTestDb()

    await expect(
      withLeaderLock(db, SchedulerLock.auditPrune, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(
      await withLeaderLock(db, SchedulerLock.auditPrune, async () => {
        await db.execute(sql`select 1`)
      }),
    ).toBe(true)
  })

  it('takes a transaction-scoped advisory lock on a pooled engine', async () => {
    const db = pooledDb()
    let ran = 0

    const won = await withLeaderLock(db, SchedulerLock.backup, async () => {
      ran += 1
    })

    expect(won).toBe(true)
    expect(ran).toBe(1)
    expect(db.sql.join()).toContain('pg_try_advisory_xact_lock')
  })

  it('skips the work when another instance holds the lock', async () => {
    let ran = 0

    const won = await withLeaderLock(pooledDb(true), SchedulerLock.sessionPurge, async () => {
      ran += 1
    })

    expect(won).toBe(false)
    expect(ran).toBe(0)
  })

  it('gives each scheduler its own key, so they never block each other', () => {
    const keys = Object.values(SchedulerLock)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
