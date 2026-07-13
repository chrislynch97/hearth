import { inArray, lt } from 'drizzle-orm'
import type { DB } from '../db/client'
import { auditLog, household } from '../db/schema'
import { scopeWhere } from '../trpc/tenant'
import { auditArchiveDir, writeAuditArchive } from './archive'

/**
 * Audit-log retention / pruning (issue #41).
 *
 * The append-only audit trail (#35) grows one row per create/update/archive/
 * delete forever; for a long-lived household it accumulates without bound. This
 * module is the ONE sanctioned bulk-delete path on that otherwise insert-only
 * table — deliberately kept out of the write path (trpc/audit.ts) so normal
 * operation never deletes.
 *
 * A household's `auditRetentionDays` gates it: 0 (the default) means keep
 * forever; N>0 means entries older than N days are prunable, both on a manual
 * `audit.prune` mutation and via the hourly background pruner below (mirroring
 * the backup scheduler in backup/runner.ts).
 *
 * Because the trail is excluded from the backup snapshot (#39/#40), a pruned
 * range is otherwise gone with no copy anywhere. A household can opt in
 * (`auditPruneArchive`, issue #43) to have the to-be-pruned rows exported to an
 * owner-only JSON archive (audit/archive.ts) first; the default stays a hard
 * delete for operators who genuinely want the rows gone.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check hourly; the retention window gates the actual delete
const DAY_MS = 86_400_000

/** The cutoff instant for a retention window: audit rows strictly older than the
 *  returned Date are prunable. `null` when retention is off (0 or less = keep
 *  forever), so callers can skip the delete entirely. */
export function retentionCutoff(retentionDays: number, now: number): Date | null {
  if (retentionDays <= 0) return null
  return new Date(now - retentionDays * DAY_MS)
}

/** Options for a prune. `archiveDir` opts into archive-before-delete (issue #43):
 *  when set, the pruned rows are exported to an owner-only JSON file under that
 *  directory before they are deleted. Omit for the default hard delete. */
export interface PruneOptions {
  archiveDir?: string
}

/** Delete this household's audit rows strictly older than `cutoff`, returning the
 *  number removed. Household-scoped through `scopeWhere` so a prune can never
 *  reach across into another household's trail. Idempotent: re-running with the
 *  same cutoff simply deletes nothing more.
 *
 *  With `opts.archiveDir` set, the matching rows are read and written to disk
 *  first, then deleted *by id* so the file and the delete cover exactly the same
 *  rows — a row inserted after the read (always newer than `cutoff`) is neither
 *  archived nor deleted. Archiving happens before the delete, so a write failure
 *  aborts the prune and the rows stay put rather than vanishing unarchived. */
export async function pruneAuditLog(
  db: DB,
  householdId: string,
  cutoff: Date,
  opts: PruneOptions = {},
): Promise<number> {
  if (opts.archiveDir) {
    const rows = await db
      .select()
      .from(auditLog)
      .where(scopeWhere(householdId, auditLog.householdId, lt(auditLog.createdAt, cutoff)))
    if (rows.length === 0) return 0
    writeAuditArchive(opts.archiveDir, householdId, cutoff, rows)
    const deleted = await db
      .delete(auditLog)
      .where(scopeWhere(householdId, auditLog.householdId, inArray(auditLog.id, rows.map((r) => r.id))))
      .returning({ id: auditLog.id })
    return deleted.length
  }
  const deleted = await db
    .delete(auditLog)
    .where(scopeWhere(householdId, auditLog.householdId, lt(auditLog.createdAt, cutoff)))
    .returning({ id: auditLog.id })
  return deleted.length
}

/** Start the periodic auto-prune. Every household sets its own
 *  `auditRetentionDays`; each tick prunes every household with a window
 *  configured (>0) down to that window. Best-effort like the backup scheduler —
 *  a failure is logged, never fatal — and idempotent, so a missed tick just
 *  prunes a little more the next hour. */
export function startAuditPruneScheduler(db: DB): void {
  const tick = async () => {
    try {
      const now = Date.now()
      const households = await db.select().from(household)
      for (const hh of households) {
        const cutoff = retentionCutoff(hh.auditRetentionDays, now)
        if (cutoff) {
          const archiveDir = hh.auditPruneArchive ? auditArchiveDir() : undefined
          await pruneAuditLog(db, hh.id, cutoff, { archiveDir })
        }
      }
    } catch (err) {
      console.error('Automatic audit prune failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for pruning
}
