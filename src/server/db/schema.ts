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
