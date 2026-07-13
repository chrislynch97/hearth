import { z } from 'zod'
import { and, desc, eq, lt } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { auditLog, household } from '../db/schema'
import type { AuditLog } from '../db/schema'
import { pruneAuditLog, retentionCutoff } from '../audit/prune'
import { auditArchiveDir } from '../audit/archive'

/** One audit row with its `changes` JSON parsed back into an object, so the
 *  client gets `{ kind, after | before | fields }` rather than a raw string. */
export interface AuditEntryView extends Omit<AuditLog, 'changes'> {
  changes: unknown
}

/**
 * Read side of the append-only audit trail (issue #35). Admin-gated: the log
 * reveals who-changed-what across the whole household, so viewing it needs the
 * `admin` role — a plain member or viewer can't inspect everyone's activity.
 * The write side lives in the mutation layer (trpc/audit.ts); this router never
 * writes.
 */
export const auditRouter = router({
  /** Recent audit entries for the household, newest first. Optionally narrowed to
   *  a single entity ("history for this pot") and cursor-paginated on createdAt. */
  list: publicProcedure
    .input(
      z
        .object({
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          // Cursor: return entries strictly older than this timestamp (the
          // createdAt of the last row on the previous page).
          before: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }): Promise<AuditEntryView[]> => {
      assertRole(ctx.role, 'admin')
      const filters = [
        input?.entityType ? eq(auditLog.entityType, input.entityType) : undefined,
        input?.entityId ? eq(auditLog.entityId, input.entityId) : undefined,
        input?.before ? lt(auditLog.createdAt, input.before) : undefined,
      ]
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .where(scopeWhere(ctx.householdId, auditLog.householdId, and(...filters)))
        // Tie-break on the id (uuidv7, time-sortable) so same-millisecond rows
        // keep a stable, creation-consistent order for display and paging.
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(input?.limit ?? 100)
      return rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }))
    }),

  /** Prune old audit entries for the household (issue #41) — the one sanctioned
   *  bulk-delete on the append-only trail, kept off the write path. Owner-gated:
   *  reading the log needs `admin`, but destroying it is a heavier act reserved
   *  for the household owner. Deletes entries older than `olderThanDays`, or —
   *  when that is omitted — older than the household's configured
   *  `auditRetentionDays`. A no-op (returns `{ pruned: 0 }`) when neither yields a
   *  window, so calling it on a retention-off household never deletes anything.
   *  When the household has opted into `auditPruneArchive` (issue #43), the pruned
   *  range is exported to an owner-only JSON archive before deletion; `archived`
   *  reports whether that happened. */
  prune: publicProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1).max(3650).optional() }).optional())
    .mutation(async ({ ctx, input }): Promise<{ pruned: number; cutoff: Date | null; archived: boolean }> => {
      assertRole(ctx.role, 'owner')
      // Always read the household: we need the archive flag, and the retention
      // window too when `olderThanDays` was omitted.
      const [hh] = await ctx.db
        .select({ retention: household.auditRetentionDays, archive: household.auditPruneArchive })
        .from(household)
        .where(eq(household.id, ctx.householdId))
      const days = input?.olderThanDays ?? hh?.retention ?? 0
      const cutoff = retentionCutoff(days, Date.now())
      if (!cutoff) return { pruned: 0, cutoff: null, archived: false }
      const archiveDir = hh?.archive ? auditArchiveDir() : undefined
      const pruned = await pruneAuditLog(ctx.db, ctx.householdId, cutoff, { archiveDir })
      return { pruned, cutoff, archived: !!archiveDir && pruned > 0 }
    }),
})
