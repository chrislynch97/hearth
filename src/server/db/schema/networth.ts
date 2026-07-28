import { pgTable, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

// ---------------------------------------------------------------------------
// Accounts & net worth (Phase 6) — asset/liability balances tracked over time.
// Balances are *not* the live-ledger the spec deliberately excludes; they are
// point-in-time snapshots the household enters periodically (e.g. a mortgage
// statement, a pension valuation) to chart net worth. Net worth subtracts
// liability balances from asset balances.
// ---------------------------------------------------------------------------

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),                  // 'asset' | 'liability'
  subtype: text('subtype'),                      // savings|pension|investment|property|mortgage|loan|student_loan|credit_card|other
  ownerId: text('owner_id')
    .notNull()
    .references(() => member.id),                // person or joint
  institution: text('institution'),             // e.g. 'Vanguard', 'Barclays'
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('account_household_id_idx').on(t.householdId),
}))

export const accountBalance = pgTable('account_balance', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => account.id, { onDelete: 'cascade' }),
  asOfDate: text('as_of_date').notNull(),        // YYYY-MM-DD
  value: integer('value').notNull(),             // minor units; magnitude of the balance (liabilities stored positive)
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqAccountDate: uniqueIndex('account_balance_account_date').on(t.accountId, t.asOfDate),
  householdIdx: index('account_balance_household_id_idx').on(t.householdId),
}))

export type Account = typeof account.$inferSelect
export type AccountBalance = typeof accountBalance.$inferSelect
