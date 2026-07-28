import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { auditLog, household } from '../../db/schema'
import { newId } from '../../../shared/ids'
import { retentionCutoff, pruneAuditLog } from './prune'
import type { DB } from '../../db/client'

const DAY = 86_400_000

/** Insert an audit row `ageDays` old for the given household. */
async function seedEntry(db: DB, householdId: string, ageDays: number, now: number): Promise<string> {
  const id = newId()
  await db.insert(auditLog).values({
    id,
    householdId,
    actorUserId: null,
    actorLabel: null,
    entityType: 'category',
    entityId: newId(),
    action: 'create',
    changes: JSON.stringify({ kind: 'create', after: {} }),
    createdAt: new Date(now - ageDays * DAY),
  })
  return id
}

async function countFor(db: DB, householdId: string): Promise<number> {
  return (await db.select().from(auditLog).where(eq(auditLog.householdId, householdId))).length
}

describe('retentionCutoff', () => {
  it('is null when retention is off (0 or less = keep forever)', () => {
    expect(retentionCutoff(0, 1000)).toBeNull()
    expect(retentionCutoff(-5, 1000)).toBeNull()
  })

  it('is `now - N days` for a positive window', () => {
    const now = 100 * DAY
    expect(retentionCutoff(30, now)).toEqual(new Date(now - 30 * DAY))
  })
})

describe('pruneAuditLog (issue #41)', () => {
  it('deletes only entries strictly older than the cutoff', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()

    const old = await seedEntry(db, 'household', 40, now)
    const fresh = await seedEntry(db, 'household', 10, now)

    const cutoff = retentionCutoff(30, now)!
    const pruned = await pruneAuditLog(db, 'household', cutoff)

    expect(pruned).toBe(1)
    const remaining = await db.select().from(auditLog).where(eq(auditLog.householdId, 'household'))
    const ids = remaining.map((r) => r.id)
    expect(ids).toContain(fresh)
    expect(ids).not.toContain(old)
  })

  it('is idempotent — a second prune with the same cutoff deletes nothing', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    await seedEntry(db, 'household', 40, now)

    const cutoff = retentionCutoff(30, now)!
    expect(await pruneAuditLog(db, 'household', cutoff)).toBe(1)
    expect(await pruneAuditLog(db, 'household', cutoff)).toBe(0)
  })

  it('archives the pruned range before deleting when a dir is given (issue #43)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    const dir = mkdtempSync(join(tmpdir(), 'hearth-audit-'))
    try {
      const old = await seedEntry(db, 'household', 40, now)
      await seedEntry(db, 'household', 10, now)

      const cutoff = retentionCutoff(30, now)!
      const pruned = await pruneAuditLog(db, 'household', cutoff, { archiveDir: dir })
      expect(pruned).toBe(1)

      // The old row is gone from the live trail...
      const ids = (await db.select().from(auditLog).where(eq(auditLog.householdId, 'household'))).map((r) => r.id)
      expect(ids).not.toContain(old)

      // ...but a JSON archive of exactly that row was written first.
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
      expect(files.length).toBe(1)
      const archive = JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'))
      expect(archive).toMatchObject({ householdId: 'household', count: 1 })
      expect(archive.entries.map((e: { id: string }) => e.id)).toEqual([old])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes no archive file when nothing is old enough to prune (issue #43)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    const dir = mkdtempSync(join(tmpdir(), 'hearth-audit-'))
    try {
      await seedEntry(db, 'household', 10, now) // newer than the window

      const cutoff = retentionCutoff(30, now)!
      const pruned = await pruneAuditLog(db, 'household', cutoff, { archiveDir: dir })
      expect(pruned).toBe(0)
      expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never reaches across households', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    const other = new Date(now)
    await db.insert(household).values({ id: 'h2', createdAt: other, updatedAt: other })

    await seedEntry(db, 'household', 40, now)
    await seedEntry(db, 'h2', 40, now)

    const cutoff = retentionCutoff(30, now)!
    const pruned = await pruneAuditLog(db, 'household', cutoff)

    expect(pruned).toBe(1)
    // h2's old entry is untouched by a prune scoped to 'household'.
    expect(await countFor(db, 'h2')).toBe(1)
  })
})
