import { inArray } from 'drizzle-orm'
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

/** Security / access-control events (issue #49). Unlike data mutations these have
 *  no before/after row to diff — they record *that something happened* (a sign-in,
 *  a role change, a password reset) with a curated, secret-free `details` payload.
 *  Never store a password, hash, TOTP secret or token: for a credential change we
 *  log only the event, never the value. Rendered from the `event` payload kind. */
export type SecurityAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'password_removed'
  | 'password_reset'
  | 'password_reset_requested'
  | 'email_verification_sent'
  | 'email_verified'
  | 'mfa_enroll_started'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'sessions_revoked'
  | 'registration_changed'
  | 'update_settings_changed'
  | 'update_applied'
  | 'role_changed'
  | 'access_removed'
  | 'invite_created'
  | 'invite_emailed'
  | 'invite_revoked'
  | 'invite_accepted'
  | 'household_erased'
  | 'restored_from_offsite'

type Row = Record<string, unknown>

/** One staged change, as a resolver reports it. For a data mutation, `before`/
 *  `after` are whole entity rows and the helper derives the stored payload (full
 *  snapshot vs field diff) from `action`. For a security event, `details` carries
 *  the curated payload instead. `householdId`/`actorUserId` override the request
 *  context for entries whose scope or actor differs from it — e.g. a login, which
 *  runs *before* the session (and thus the context's identity) exists. */
export interface StagedAudit {
  entityType: string
  entityId: string
  action: AuditAction | SecurityAction
  before?: Row | null
  after?: Row | null
  /** Curated, secret-free payload for a security event (never a raw row). */
  details?: Record<string, unknown>
  /** Household this entry belongs to; falls back to `ctx.householdId`. */
  householdId?: string
  /** Acting user (`null` = deliberately no actor, e.g. a failed login by an
   *  attacker); `undefined` falls back to `ctx.userId`. */
  actorUserId?: string | null
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
    default:
      // Security event (issue #49): store the curated payload verbatim.
      return JSON.stringify({ kind: 'event', details: entry.details ?? {} })
  }
}

/** Stage one change for this request. Synchronous by design: it only appends to
 *  the per-request buffer, so a resolver adds a single line after its write and
 *  the actual insert happens once, in the flush. Call it *after* the write has
 *  succeeded — a resolver that then throws leaves the entry unflushed. */
export function recordAudit(ctx: AuditCtx, entry: StagedAudit): void {
  ;(ctx.auditEntries ??= []).push(entry)
}

/** A security / access-control event for this request (issue #49). Same staging
 *  as `recordAudit`, so it rides the same flush after a successful mutation, but
 *  carries a curated `details` payload and may override the scope/actor for events
 *  that run before the session context reflects them (login, invite acceptance). */
export function recordSecurityEvent(
  ctx: AuditCtx,
  entry: {
    entityType: string
    entityId: string
    action: SecurityAction
    details?: Record<string, unknown>
    householdId?: string
    actorUserId?: string | null
  },
): void {
  ;(ctx.auditEntries ??= []).push(entry)
}

/** Resolve display-name labels for a set of actor ids in one query, so a batch of
 *  entries with different actors captures each name (history survives a rename or
 *  removal). Ids with no matching user simply get no label. */
async function resolveActorLabels(db: DBOrTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: user.id, displayName: user.displayName }).from(user).where(inArray(user.id, ids))
  return new Map(rows.map((r) => [r.id, r.displayName]))
}

/** Turn staged entries into audit rows, filling household/actor from each entry's
 *  own override or the request-context fallback, and stamping actor label + time.
 *  Shared by the flush (success path) and the direct write (failed-login path). */
async function buildAuditRows(
  db: DBOrTx,
  entries: StagedAudit[],
  fallback: { householdId: string; actorUserId: string | null },
): Promise<Array<typeof auditLog.$inferInsert>> {
  const actorOf = (e: StagedAudit) => (e.actorUserId !== undefined ? e.actorUserId : fallback.actorUserId)
  const actorIds = new Set<string>()
  for (const e of entries) {
    const a = actorOf(e)
    if (a) actorIds.add(a)
  }
  const labels = await resolveActorLabels(db, [...actorIds])
  const now = new Date()
  return entries.map((e) => {
    const actorUserId = actorOf(e)
    return {
      id: newId(),
      householdId: e.householdId ?? fallback.householdId,
      actorUserId: actorUserId ?? null,
      actorLabel: actorUserId ? (labels.get(actorUserId) ?? null) : null,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      changes: buildChanges(e),
      createdAt: now,
    }
  })
}

/** Write every staged entry for this request as one insert, stamping household,
 *  actor (id + display name captured now, so history survives a rename/removal)
 *  and time. Called by the audit middleware after a successful mutation; a no-op
 *  when nothing was staged. */
export async function flushAuditEntries(ctx: AuditCtx): Promise<void> {
  const entries = ctx.auditEntries
  if (!entries || entries.length === 0) return

  const rows = await buildAuditRows(ctx.db, entries, {
    householdId: ctx.householdId,
    actorUserId: ctx.userId ?? null,
  })
  await ctx.db.insert(auditLog).values(rows)
  entries.length = 0
}

/** Write a single security event immediately, outside the staged flush. For the
 *  one case staging can't cover: a failed login, where the resolver *throws* — so
 *  `recordAuditMiddleware` never flushes — yet the attempt must still be recorded.
 *  Best-effort at the call site (a failure here must never mask the auth error). */
export async function writeSecurityEvent(
  db: DBOrTx,
  entry: {
    householdId: string
    actorUserId?: string | null
    entityType: string
    entityId: string
    action: SecurityAction
    details?: Record<string, unknown>
  },
): Promise<void> {
  const rows = await buildAuditRows(
    db,
    [
      {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        details: entry.details,
      },
    ],
    { householdId: entry.householdId, actorUserId: entry.actorUserId ?? null },
  )
  await db.insert(auditLog).values(rows)
}
