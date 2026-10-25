import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { household } from './tenancy'
import { pot } from './budget'

// ---------------------------------------------------------------------------
// Savings planners (hearth-planning#15) — a goal on top of one pot, broken into
// dated items. Money goes in through the pot's set-asides, so there is no
// second money engine; the goal links to the pot, never to a set-aside row,
// because the Pots editor recreates a pot's lines on every edit. Hearth tracks
// no pot balances, so the goal keeps the balances the household records.
// ---------------------------------------------------------------------------

export const savingsGoal = pgTable('savings_goal', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  potId: text('pot_id').notNull().references(() => pot.id),
  // 6 lowercase base36 chars, set on create and never changed: the stable part
  // of the goal's URL (`/planners/k3x9p2-wedding`), so a rename can't break links.
  shortId: text('short_id').notNull(),
  name: text('name').notNull(),
  targetAmount: integer('target_amount').notNull(), // minor units; what the pot should hold by the date
  targetDate: text('target_date').notNull(),        // YYYY-MM-DD
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqPot: uniqueIndex('savings_goal_pot').on(t.householdId, t.potId),
  uniqShortId: uniqueIndex('savings_goal_short_id').on(t.householdId, t.shortId),
  householdIdx: index('savings_goal_household_id_idx').on(t.householdId),
}))

export const savingsItem = pgTable('savings_item', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  goalId: text('goal_id').notNull().references(() => savingsGoal.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),           // minor units
  dueDate: text('due_date'),                     // YYYY-MM-DD; null = due on the goal date
  paidOn: text('paid_on'),                       // YYYY-MM-DD; set by hand when it's paid
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('savings_item_household_id_idx').on(t.householdId),
  goalIdx: index('savings_item_goal_id_idx').on(t.goalId),
}))

export const savingsBalance = pgTable('savings_balance', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  goalId: text('goal_id').notNull().references(() => savingsGoal.id, { onDelete: 'cascade' }),
  asOfDate: text('as_of_date').notNull(),        // YYYY-MM-DD
  amount: integer('amount').notNull(),           // minor units; what was in the pot that day
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqGoalDate: uniqueIndex('savings_balance_goal_date').on(t.goalId, t.asOfDate),
  householdIdx: index('savings_balance_household_id_idx').on(t.householdId),
}))

export type SavingsGoal = typeof savingsGoal.$inferSelect
export type SavingsItem = typeof savingsItem.$inferSelect
export type SavingsBalance = typeof savingsBalance.$inferSelect
