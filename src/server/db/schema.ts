import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const household = sqliteTable('household', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull().default('My Household'),
  currencyCode: text('currency_code').notNull().default('GBP'),
  currencySymbol: text('currency_symbol').notNull().default('£'),
  currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2),
  locale: text('locale').notNull().default('en-GB'),
  budgetPeriodStartDay: integer('budget_period_start_day').notNull().default(1),
  passwordHash: text('password_hash'),
  themePreference: text('theme_preference').notNull().default('system'),
  setupCompletedAt: integer('setup_completed_at'),
  incomeBasisDefault: text('income_basis_default').notNull().default('regular_net'),
  jointContributionBasis: text('joint_contribution_basis').notNull().default('equal'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'person' | 'joint'
  displayName: text('display_name').notNull(),
  shortLabel: text('short_label'),
  color: text('color'),
  jointContributionWeight: integer('joint_contribution_weight'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Household = typeof household.$inferSelect
export type Member = typeof member.$inferSelect

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const pot = sqliteTable('pot', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: text('category_id').references(() => category.id),
  ownerId: text('owner_id')
    .notNull()
    .references(() => member.id),
  isDrawdown: integer('is_drawdown').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  note: text('note'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Category = typeof category.$inferSelect
export type Pot = typeof pot.$inferSelect

export const expense = sqliteTable('expense', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  recurrence: text('recurrence').notNull(), // 'monthly' | 'quarterly' | 'yearly'
  note: text('note'),
  active: integer('active').notNull().default(1),
  dueAnchor: text('due_anchor'),            // YYYY-MM-DD of one known occurrence
  dueReminderDays: integer('due_reminder_days'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const expenseShare = sqliteTable('expense_share', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull().references(() => expense.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => member.id),
  amount: integer('amount').notNull(),      // minor units, per-recurrence cost for this owner
  potId: text('pot_id').references(() => pot.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  uniqExpenseOwner: uniqueIndex('expense_share_expense_owner').on(t.expenseId, t.ownerId),
}))

export type Expense = typeof expense.$inferSelect
export type ExpenseShare = typeof expenseShare.$inferSelect

export const reconciliationBatch = sqliteTable('reconciliation_batch', {
  id: text('id').primaryKey(),
  potId: text('pot_id').references(() => pot.id), // null = mixed/multi-pot
  totalAmount: integer('total_amount').notNull(),
  transactionCount: integer('transaction_count').notNull(),
  reversedAt: integer('reversed_at'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const spendTransaction = sqliteTable('spend_transaction', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // minor units; + = spend, - = refund
  ownerId: text('owner_id').notNull().references(() => member.id),
  potId: text('pot_id').references(() => pot.id), // null = needs a pot
  categoryId: text('category_id').references(() => category.id), // used only when potId is null
  reconciled: integer('reconciled').notNull().default(0),
  reconciledAt: integer('reconciled_at'),
  reconciliationBatchId: text('reconciliation_batch_id').references(() => reconciliationBatch.id),
  source: text('source').notNull().default('manual'),
  splitGroupId: text('split_group_id'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type ReconciliationBatch = typeof reconciliationBatch.$inferSelect
export type SpendTransaction = typeof spendTransaction.$inferSelect

// ---------------------------------------------------------------------------
// Income, payslips & raises (Phase 5)
// ---------------------------------------------------------------------------

// Recurring non-payslip income (e.g. rental, side income, benefits).
export const incomeSource = sqliteTable('income_source', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => member.id),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),          // minor units, per-recurrence
  basis: text('basis').notNull().default('net'), // 'net' | 'gross'
  recurrence: text('recurrence').notNull(),      // monthly|quarterly|yearly|weekly|fortnightly|one_off
  active: integer('active').notNull().default(1),
  note: text('note'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// Per-member configurable payslip line-item definitions. Earnings and
// deductions differ by employer, so they're runtime data, not fixed columns.
export const payslipComponentType = sqliteTable('payslip_component_type', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => member.id),
  name: text('name').notNull(),                  // e.g. 'Basic Pay', 'Bonus', 'Income Tax'
  kind: text('kind').notNull(),                  // 'earning' | 'deduction' | 'employer_info'
  isVariable: integer('is_variable').notNull().default(0), // bonus/overtime — excluded from regular net
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const payslip = sqliteTable('payslip', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => member.id),
  payDate: text('pay_date').notNull(),           // YYYY-MM-DD
  periodLabel: text('period_label'),             // e.g. 'October 2020'
  netPay: integer('net_pay'),                    // recorded override; effective_net falls back to computed
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const payslipLine = sqliteTable('payslip_line', {
  id: text('id').primaryKey(),
  payslipId: text('payslip_id').notNull().references(() => payslip.id, { onDelete: 'cascade' }),
  componentId: text('component_id').notNull().references(() => payslipComponentType.id),
  amount: integer('amount').notNull(),           // minor units
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  uniqPayslipComponent: uniqueIndex('payslip_line_payslip_component').on(t.payslipId, t.componentId),
}))

// Salary history. Each raise is one row; percent_increase is computed vs the prior raise.
export const raise = sqliteTable('raise', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => member.id),
  effectiveDate: text('effective_date').notNull(), // YYYY-MM-DD
  newSalary: integer('new_salary').notNull(),      // annual, minor units
  bonus: integer('bonus'),                         // documented; excluded from monthly capacity
  newPosition: text('new_position'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type IncomeSource = typeof incomeSource.$inferSelect
export type PayslipComponentType = typeof payslipComponentType.$inferSelect
export type Payslip = typeof payslip.$inferSelect
export type PayslipLine = typeof payslipLine.$inferSelect
export type Raise = typeof raise.$inferSelect
