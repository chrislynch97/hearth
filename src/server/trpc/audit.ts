import { eq } from 'drizzle-orm'
import { auditLog, user } from '../db/schema'
import type { DBOrTx } from '../db/client'
import { newId } from '../../shared/ids'

/**
 * Append-only audit log (issue #35).
 *
 * Optimistic locking (issue #23) stops a stale write from *silently* clobbering
 * another edit, but nothing recorded *who changed what*, so a legitimately
 * overwritten — or simply mistaken — edit couldn't be seen or recovered after
 * the fact. These helpers centralise that record the same way `concurrency.ts`
 * centralised the compare-and-swap: a resolver calls `recordAudit(ctx, …)` after
 * a write lands, and a single middleware (`trpc.ts`) flushes the staged entries
 * to the `audit_log` table once the mutation succeeds.
 *
 * Staging (not writing inline) keeps every audit insert in one place — filling
 * household, actor and timestamp uniformly — and lets the flush be best-effort:
 * a failure to write the trail must never fail a user's legitimate mutation.
 */

export type AuditAction = 'create' | 'update' | 'archive' | 'delete'

type Row = Record<string, unknown>

/** One staged change, as a resolver reports it. `before`/`after` are whole entity
 *  rows; the helper derives the stored payload (full snapshot vs field diff) from
 *  `action`, so callers just pass the rows they already have in hand. */
export interface StagedAudit {
  entityType: string
  entityId: string
  action: AuditAction
  before?: Row | null
  after?: Row | null
}

/** The slice of the tRPC context the audit helpers touch. `Context` satisfies it. */
export interface AuditCtx {
  db: DBOrTx
  householdId: string
  userId?: string
  auditEntries?: StagedAudit[]
}

// Redundant on every snapshot (the audit row already carries householdId).
const SNAPSHOT_OMIT = new Set(['householdId'])
// Mechanical fields that always change on an update and add only noise to a diff.
const DIFF_OMIT = new Set(['householdId', 'updatedAt'])

/** A row copy fit for storage: drop columns that repeat the audit row itself. */
function snapshot(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (!SNAPSHOT_OMIT.has(k)) out[k] = v
  }
  return out
}

/** Value equality for diffing. `Date`s compare by instant (columns are `Date`
 *  objects end to end); nested objects/arrays (e.g. a payslip's `lines`) compare
 *  structurally, so a note-only edit isn't misreported as a `lines` change. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/** `{ field: { before, after } }` for every column whose value actually changed. */
function diffFields(before: Row, after: Row): Record<string, { before: unknown; after: unknown }> {
  const changed: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (DIFF_OMIT.has(key)) continue
    if (!sameValue(before[key], after[key])) changed[key] = { before: before[key], after: after[key] }
  }
  return changed
}

/** The JSON payload stored in `audit_log.changes`. Date fields serialise to ISO
 *  strings via `Date.prototype.toJSON`; the snapshot is a record, not portable
 *  data, so it needs no epoch-millis marshalling (unlike db/snapshot.ts). */
function buildChanges(entry: StagedAudit): string {
  switch (entry.action) {
    case 'create':
      return JSON.stringify({ kind: 'create', after: snapshot(entry.after ?? {}) })
    case 'archive':
      return JSON.stringify({ kind: 'archive', before: snapshot(entry.before ?? {}) })
    case 'delete':
      return JSON.stringify({ kind: 'delete', before: snapshot(entry.before ?? {}) })
    case 'update':
      return JSON.stringify({
        kind: 'update',
        fields: entry.before && entry.after ? diffFields(entry.before, entry.after) : {},
      })
  }
}

/** Stage one change for this request. Synchronous by design: it only appends to
 *  the per-request buffer, so a resolver adds a single line after its write and
 *  the actual insert happens once, in the flush. Call it *after* the write has
 *  succeeded — a resolver that then throws leaves the entry unflushed. */
export function recordAudit(ctx: AuditCtx, entry: StagedAudit): void {
  ;(ctx.auditEntries ??= []).push(entry)
}

/** Write every staged entry for this request as one insert, stamping household,
 *  actor (id + display name captured now, so history survives a rename/removal)
 *  and time. Called by the audit middleware after a successful mutation; a no-op
 *  when nothing was staged. */
export async function flushAuditEntries(ctx: AuditCtx): Promise<void> {
  const entries = ctx.auditEntries
  if (!entries || entries.length === 0) return

  let actorLabel: string | null = null
  if (ctx.userId) {
    const [u] = await ctx.db.select({ displayName: user.displayName }).from(user).where(eq(user.id, ctx.userId))
    actorLabel = u?.displayName ?? null
  }

  const now = new Date()
  const rows = entries.map((e) => ({
    id: newId(),
    householdId: ctx.householdId,
    actorUserId: ctx.userId ?? null,
    actorLabel,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    changes: buildChanges(e),
    createdAt: now,
  }))
  await ctx.db.insert(auditLog).values(rows)
  entries.length = 0
}
