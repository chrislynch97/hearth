import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

// ---------------------------------------------------------------------------
// Maintenance — the house's recurring jobs (boiler service, gutters), each with
// a next due date that moves on from whenever it was last done, and a log of
// every time it was. A one-off job is archived once done, so its log survives.
// ---------------------------------------------------------------------------

export const maintenanceJob = pgTable('maintenance_job', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  area: text('area').notNull().default('other'), // see shared/maintenance.ts
  notes: text('notes'),
  // Who usually does it, and so who's nudged; null = everyone.
  assigneeId: text('assignee_id').references(() => member.id, { onDelete: 'set null' }),
  dueDate: text('due_date').notNull(),           // YYYY-MM-DD
  repeatEvery: integer('repeat_every'),          // null = one-off
  repeatUnit: text('repeat_unit').notNull().default('month'), // see shared/schedule.ts
  remindDays: integer('remind_days').notNull(),
  // The due date the reminder last went out for. Moving the date re-arms it.
  remindedFor: text('reminded_for'),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('maintenance_job_household_id_idx').on(t.householdId),
}))

export const maintenanceLog = pgTable('maintenance_log', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => maintenanceJob.id, { onDelete: 'cascade' }),
  doneOn: text('done_on').notNull(),             // YYYY-MM-DD
  doneById: text('done_by_id').references(() => member.id, { onDelete: 'set null' }),
  amount: integer('amount'),                     // minor units, if it cost anything
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('maintenance_log_household_id_idx').on(t.householdId),
  jobIdx: index('maintenance_log_job_id_idx').on(t.jobId),
}))

export type MaintenanceJob = typeof maintenanceJob.$inferSelect
export type MaintenanceLog = typeof maintenanceLog.$inferSelect
