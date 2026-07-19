import { describe, it, expect } from 'vitest'
import { makeTestDb } from './testdb'
import { SchedulerLock, withLeaderLock } from './leader'
import type { DB } from './client'

/** A `DB` stand-in whose advisory-lock query always reports the lock as taken —
 *  the non-leader case, which a single PGlite connection can't produce for real
 *  (concurrent transactions need a second connection). */
function lockedDb(): DB {
  return {
    transaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({ execute: async () => ({ rows: [{ locked: false }] }) }),
  } as unknown as DB
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

  it('releases the lock at the end of the tick, so the next tick can take it', async () => {
    const db = await makeTestDb()

    expect(await withLeaderLock(db, SchedulerLock.backup, async () => {})).toBe(true)
    expect(await withLeaderLock(db, SchedulerLock.backup, async () => {})).toBe(true)
  })

  it('releases the lock even when the work throws', async () => {
    const db = await makeTestDb()

    await expect(
      withLeaderLock(db, SchedulerLock.auditPrune, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(await withLeaderLock(db, SchedulerLock.auditPrune, async () => {})).toBe(true)
  })

  it('skips the work when another instance holds the lock', async () => {
    let ran = 0

    const won = await withLeaderLock(lockedDb(), SchedulerLock.sessionPurge, async () => {
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
