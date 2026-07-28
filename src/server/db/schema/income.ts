import { pgTable, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

// ---------------------------------------------------------------------------
// Income, payslips & raises (Phase 5)
// ---------------------------------------------------------------------------

// Recurring non-payslip income (e.g. rental, side income, benefits).
export const incomeSource = pgTable('income_source', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),          // minor units, per-recurrence
  basis: text('basis').notNull().default('net'), // 'net' | 'gross'
  recurrence: text('recurrence').notNull(),      // monthly|quarterly|yearly|weekly|fortnightly|one_off
  active: integer('active').notNull().default(1),
  note: text('note'),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('income_source_household_id_idx').on(t.householdId),
}))

// Per-member configurable payslip line-item definitions. Earnings and
// deductions differ by employer, so they're runtime data, not fixed columns.
export const payslipComponentType = pgTable('payslip_component_type', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  name: text('name').notNull(),                  // e.g. 'Basic Pay', 'Bonus', 'Income Tax'
  kind: text('kind').notNull(),                  // 'earning' | 'deduction' | 'employer_info'
  isVariable: integer('is_variable').notNull().default(0), // bonus/overtime — excluded from regular net
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('payslip_component_type_household_id_idx').on(t.householdId),
}))

export const payslip = pgTable('payslip', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  payDate: text('pay_date').notNull(),           // YYYY-MM-DD
  periodLabel: text('period_label'),             // e.g. 'October 2020'
  netPay: integer('net_pay'),                    // recorded override; effective_net falls back to computed
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('payslip_household_id_idx').on(t.householdId),
}))

export const payslipLine = pgTable('payslip_line', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  payslipId: text('payslip_id').notNull().references(() => payslip.id, { onDelete: 'cascade' }),
  componentId: text('component_id').notNull().references(() => payslipComponentType.id),
  amount: integer('amount').notNull(),           // minor units
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqPayslipComponent: uniqueIndex('payslip_line_payslip_component').on(t.payslipId, t.componentId),
  householdIdx: index('payslip_line_household_id_idx').on(t.householdId),
}))

// Salary history. Each raise is one row; percent_increase is computed vs the prior raise.
export const raise = pgTable('raise', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  effectiveDate: text('effective_date').notNull(), // YYYY-MM-DD
  newSalary: integer('new_salary').notNull(),      // annual, minor units
  bonus: integer('bonus'),                         // documented; excluded from monthly capacity
  newPosition: text('new_position'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('raise_household_id_idx').on(t.householdId),
}))

export type IncomeSource = typeof incomeSource.$inferSelect
export type PayslipComponentType = typeof payslipComponentType.$inferSelect
export type Payslip = typeof payslip.$inferSelect
export type PayslipLine = typeof payslipLine.$inferSelect
export type Raise = typeof raise.$inferSelect
