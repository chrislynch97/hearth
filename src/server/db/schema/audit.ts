import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { household } from './tenancy'

// ---------------------------------------------------------------------------
// Audit log (issue #35) — append-only record of household-data edits.
// ---------------------------------------------------------------------------
// Every create / update / archive / delete of a domain entity writes one row
// here, so a clobbered or mistaken change can be seen and recovered after the
// fact. Optimistic locking (issue #23) stops a stale write from *silently*
// winning; this records *who changed what* when a write legitimately lands.
//
// Append-only: rows are only ever inserted, never updated or deleted in normal
// operation (there is no `updatedAt`). Household-scoped with an FK cascade, so
// deleting a household clears its trail. The actor is a LOGICAL reference to
// `user.id` (no FK) plus a denormalized label captured at write time, so the
// history survives the actor being renamed or removed. Deliberately excluded
// from ALL_TABLES: it is operational metadata, not part of the portability
// contract, and its JSON payloads must never be currency-rescaled.
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  // Who made the change: the acting user's id (logical ref) + their display name
  // at the time. Null only when no identity could be resolved (should not happen
  // for a write, which always carries a role).
  actorUserId: text('actor_user_id'),
  actorLabel: text('actor_label'),
  entityType: text('entity_type').notNull(), // 'pot' | 'spend' | 'expense' | …
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),          // 'create' | 'update' | 'archive' | 'delete'
  // JSON payload describing the change (db/../trpc/audit.ts writes it):
  //   create  → { kind:'create',  after:  {…row} }
  //   update  → { kind:'update',  fields: { name:{before,after}, … } }
  //   archive → { kind:'archive', before: {…row} }
  //   delete  → { kind:'delete',  before: {…row} }
  changes: text('changes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('audit_log_household_id_idx').on(t.householdId),
  // The common lookup: "history for this one entity", newest first.
  entityIdx: index('audit_log_entity_idx').on(t.householdId, t.entityType, t.entityId),
  // Retention prune (issue #41) scans by age within a household:
  // WHERE household_id = ? AND created_at < cutoff. This index makes that a range
  // scan rather than a full-table sweep for long-lived households.
  createdIdx: index('audit_log_household_created_idx').on(t.householdId, t.createdAt),
}))

export type AuditLog = typeof auditLog.$inferSelect
