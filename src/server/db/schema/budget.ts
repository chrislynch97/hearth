import { pgTable, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

export const category = pgTable('category', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('category_household_id_idx').on(t.householdId),
}))

export const pot = pgTable('pot', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryId: text('category_id').references(() => category.id),
  ownerId: text('owner_id')
    .notNull()
    .references(() => member.id),
  sortOrder: integer('sort_order').notNull().default(0),
  note: text('note'),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('pot_household_id_idx').on(t.householdId),
}))

export type Category = typeof category.$inferSelect
export type Pot = typeof pot.$inferSelect

// A "bill" — a recurring payment that drains a single pot (or the main account)
// and gets logged as a spend + reconciled on catch-up. Who actually pays lives on
// the spend, not here. `funding` decides the shape:
//   'pot_manual' — potId set; money moved out of the pot manually → shows on catch-up
//   'pot_auto'   — potId set; the pot auto-deducts (e.g. Monzo) → no catch-up
//   'main'       — potId null; paid from the main account under categoryId → no catch-up
// (The legacy per-owner `expense_share` model was retired; see the 001x migration.)
export const expense = pgTable('expense', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  recurrence: text('recurrence').notNull(), // 'monthly' | 'quarterly' | 'yearly'
  amount: integer('amount'),                // minor units, per-recurrence; null on un-migrated legacy rows
  funding: text('funding').notNull().default('pot_manual'), // 'pot_manual' | 'pot_auto' | 'main'
  potId: text('pot_id').references(() => pot.id),           // the pot it drains; null when funding = 'main'
  categoryId: text('category_id').references(() => category.id), // required when funding = 'main'
  note: text('note'),
  active: integer('active').notNull().default(1),
  // 0/1: counts toward the emergency-fund target (issue #118). Default 1 — every
  // bill is included unless explicitly removed from the calculation.
  includeInEmergencyFund: integer('include_in_emergency_fund').notNull().default(1),
  dueAnchor: text('due_anchor'),            // YYYY-MM-DD of one known occurrence
  dueReminderDays: integer('due_reminder_days'),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('expense_household_id_idx').on(t.householdId),
}))

// DEPRECATED — retired in favour of single-pot bills (above) + the `set_aside`
// table. Kept defined so migrations can read legacy rows out of it; do not write
// new rows. A later migration drops it once every household has migrated.
export const expenseShare = pgTable('expense_share', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  expenseId: text('expense_id').notNull().references(() => expense.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  amount: integer('amount').notNull(),      // minor units, per-recurrence cost for this owner
  potId: text('pot_id').references(() => pot.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqExpenseOwner: uniqueIndex('expense_share_expense_owner').on(t.expenseId, t.ownerId),
  householdIdx: index('expense_share_household_id_idx').on(t.householdId),
}))

// Bill price history (issue #68). Each change to a bill's amount is one
// effective-dated row — the `raise` table for outgoings. `expense.amount` stays
// the current price; this records how it got there so projections and the
// standing-order review can see the trend. `source` distinguishes a change
// confirmed against a real payment ('spend_prompt') from a speculative edit
// ('manual') — the former is stronger evidence.
export const billPrice = pgTable('bill_price', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  expenseId: text('expense_id').notNull().references(() => expense.id, { onDelete: 'cascade' }),
  effectiveDate: text('effective_date').notNull(), // YYYY-MM-DD
  amount: integer('amount').notNull(),             // minor units, per-recurrence
  note: text('note'),
  source: text('source').notNull(),               // 'manual' | 'spend_prompt'
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('bill_price_household_id_idx').on(t.householdId),
  expenseIdx: index('bill_price_expense_id_idx').on(t.expenseId),
}))

// Standing-order acknowledgement (issue #69). A pot's monthly funding requirement
// is DERIVED from the `pot_manual` bills that drain it — there is no stored
// standing order. When a bill's price changes that requirement moves, and the
// standing order set up at the real bank silently goes stale. We persist only what
// was last acknowledged: the monthly requirement the household confirmed it had set
// up. Comparing it against the current derived requirement surfaces "your standing
// order needs updating". One row per pot; `amount` is monthly minor units, and
// `updatedAt` doubles as "last acknowledged" (the boundary for attributing which
// bill changes happened since). Scoped to `pot_manual` — `pot_auto`/`main` bills
// have no standing order to update.
export const standingOrderAck = pgTable('standing_order_ack', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  potId: text('pot_id').notNull().references(() => pot.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),             // monthly minor units — the acknowledged pot_manual requirement
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqPot: uniqueIndex('standing_order_ack_pot').on(t.householdId, t.potId),
  householdIdx: index('standing_order_ack_household_id_idx').on(t.householdId),
}))

export type Expense = typeof expense.$inferSelect
export type ExpenseShare = typeof expenseShare.$inferSelect
export type BillPrice = typeof billPrice.$inferSelect
export type StandingOrderAck = typeof standingOrderAck.$inferSelect

// A "set aside" — a recurring contribution that *fills* a pot (money in), as
// opposed to a bill that drains one (money out). Always one owner into one pot;
// never appears on the spending screen or catch-up. `groupLabel` lets several
// set-asides share a display name (e.g. "Treat Yo Self" = one per person).
export const setAside = pgTable('set_aside', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupLabel: text('group_label'),          // optional shared label across per-person rows
  ownerId: text('owner_id').notNull().references(() => member.id),
  potId: text('pot_id').notNull().references(() => pot.id),
  amount: integer('amount').notNull(),      // minor units, per-recurrence
  recurrence: text('recurrence').notNull(), // 'monthly' | 'quarterly' | 'yearly'
  note: text('note'),
  active: integer('active').notNull().default(1),
  // 0/1: counts toward the emergency-fund target (issue #118). Default 1 — every
  // set-aside is included unless explicitly removed from the calculation.
  includeInEmergencyFund: integer('include_in_emergency_fund').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('set_aside_household_id_idx').on(t.householdId),
}))

export type SetAside = typeof setAside.$inferSelect
