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
  // TOTP MFA (opt-in, layered on top of the shared password). `mfaSecret` is the
  // base32 seed; `mfaEnabledAt` gates enforcement (a secret can exist mid-enrolment
  // before it's confirmed); `mfaRecoveryCodes` is a JSON array of scrypt-hashed
  // single-use codes.
  mfaSecret: text('mfa_secret'),
  mfaEnabledAt: integer('mfa_enabled_at'),
  mfaRecoveryCodes: text('mfa_recovery_codes'),
  themePreference: text('theme_preference').notNull().default('system'),
  weekStart: text('week_start').notNull().default('monday'),   // 'monday' | 'sunday'
  dateFormat: text('date_format').notNull().default('medium'), // 'iso' | 'numeric' | 'medium' | 'long'
  backupFrequency: text('backup_frequency').notNull().default('off'), // 'off' | 'daily' | 'weekly'
  backupLastAt: integer('backup_last_at'),
  setupCompletedAt: integer('setup_completed_at'),
  incomeBasisDefault: text('income_basis_default').notNull().default('regular_net'),
  jointContributionBasis: text('joint_contribution_basis').notNull().default('equal'),
  // Emergency fund target = this many months of essential bills (spec: 3 months rule of thumb).
  emergencyFundMonths: integer('emergency_fund_months').notNull().default(3),
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
  sortOrder: integer('sort_order').notNull().default(0),
  note: text('note'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type Category = typeof category.$inferSelect
export type Pot = typeof pot.$inferSelect

// A "bill" — a recurring payment that drains a single pot (or the main account)
// and gets logged as a spend + reconciled on catch-up. Who actually pays lives on
// the spend, not here. `funding` decides the shape:
//   'pot_manual' — potId set; money moved out of the pot manually → shows on catch-up
//   'pot_auto'   — potId set; the pot auto-deducts (e.g. Monzo) → no catch-up
//   'main'       — potId null; paid from the main account under categoryId → no catch-up
// (The legacy per-owner `expense_share` model was retired; see the 001x migration.)
export const expense = sqliteTable('expense', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  recurrence: text('recurrence').notNull(), // 'monthly' | 'quarterly' | 'yearly'
  amount: integer('amount'),                // minor units, per-recurrence; null on un-migrated legacy rows
  funding: text('funding').notNull().default('pot_manual'), // 'pot_manual' | 'pot_auto' | 'main'
  potId: text('pot_id').references(() => pot.id),           // the pot it drains; null when funding = 'main'
  categoryId: text('category_id').references(() => category.id), // required when funding = 'main'
  note: text('note'),
  active: integer('active').notNull().default(1),
  dueAnchor: text('due_anchor'),            // YYYY-MM-DD of one known occurrence
  dueReminderDays: integer('due_reminder_days'),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// DEPRECATED — retired in favour of single-pot bills (above) + the `set_aside`
// table. Kept defined so migrations can read legacy rows out of it; do not write
// new rows. A later migration drops it once every household has migrated.
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

// A "set aside" — a recurring contribution that *fills* a pot (money in), as
// opposed to a bill that drains one (money out). Always one owner into one pot;
// never appears on the spending screen or catch-up. `groupLabel` lets several
// set-asides share a display name (e.g. "Treat Yo Self" = one per person).
export const setAside = sqliteTable('set_aside', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  groupLabel: text('group_label'),          // optional shared label across per-person rows
  ownerId: text('owner_id').notNull().references(() => member.id),
  potId: text('pot_id').notNull().references(() => pot.id),
  amount: integer('amount').notNull(),      // minor units, per-recurrence
  recurrence: text('recurrence').notNull(), // 'monthly' | 'quarterly' | 'yearly'
  note: text('note'),
  active: integer('active').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type SetAside = typeof setAside.$inferSelect

export const reconciliationBatch = sqliteTable('reconciliation_batch', {
  id: text('id').primaryKey(),
  potId: text('pot_id').references(() => pot.id), // null = mixed/multi-pot
  ownerId: text('owner_id').references(() => member.id), // the payer this batch settled; null = whole-pot / legacy
  totalAmount: integer('total_amount').notNull(),
  transactionCount: integer('transaction_count').notNull(),
  reversedAt: integer('reversed_at'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// Import batches — one Monzo CSV upload (spec §5.3). Preserved for audit and
// so a whole import can be identified (and, in future, reversed).
export const importBatch = sqliteTable('import_batch', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),        // 'monzo_csv'
  filename: text('filename'),
  rowCount: integer('row_count').notNull(),        // rows in the file
  importedCount: integer('imported_count').notNull(),
  skippedCount: integer('skipped_count').notNull(),
  mapping: text('mapping'),                 // JSON: column mapping used
  importedAt: integer('imported_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const spendTransaction = sqliteTable('spend_transaction', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // minor units; + = spend, - = refund
  ownerId: text('owner_id').notNull().references(() => member.id),
  potId: text('pot_id').references(() => pot.id), // null = needs a pot, or a main-account spend (see settledAtSource)
  categoryId: text('category_id').references(() => category.id), // used when potId is null (unassigned or main-account)
  // "No pot transfer needed": the money already left the right place, so this
  // spend never appears on catch-up. True for pot auto-deductions (Monzo pots)
  // and for main-account spends (potId null + categoryId set). A genuinely
  // un-assigned spend is potId null AND settledAtSource 0.
  settledAtSource: integer('settled_at_source').notNull().default(0),
  reconciled: integer('reconciled').notNull().default(0),
  reconciledAt: integer('reconciled_at'),
  reconciliationBatchId: text('reconciliation_batch_id').references(() => reconciliationBatch.id),
  source: text('source').notNull().default('manual'), // 'manual' | 'import'
  importRef: text('import_ref'),                       // Monzo Transaction ID; unique dedup key (NULL for manual)
  importBatchId: text('import_batch_id').references(() => importBatch.id),
  raw: text('raw'),                                    // JSON of the original imported row
  splitGroupId: text('split_group_id'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  uniqImportRef: uniqueIndex('spend_transaction_import_ref').on(t.importRef),
}))

export type ReconciliationBatch = typeof reconciliationBatch.$inferSelect
export type SpendTransaction = typeof spendTransaction.$inferSelect
export type ImportBatch = typeof importBatch.$inferSelect

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

// ---------------------------------------------------------------------------
// Accounts & net worth (Phase 6) — asset/liability balances tracked over time.
// Balances are *not* the live-ledger the spec deliberately excludes; they are
// point-in-time snapshots the household enters periodically (e.g. a mortgage
// statement, a pension valuation) to chart net worth. Net worth subtracts
// liability balances from asset balances.
// ---------------------------------------------------------------------------

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),                  // 'asset' | 'liability'
  subtype: text('subtype'),                      // savings|pension|investment|property|mortgage|loan|student_loan|credit_card|other
  ownerId: text('owner_id')
    .notNull()
    .references(() => member.id),                // person or joint
  institution: text('institution'),             // e.g. 'Vanguard', 'Barclays'
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const accountBalance = sqliteTable('account_balance', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => account.id, { onDelete: 'cascade' }),
  asOfDate: text('as_of_date').notNull(),        // YYYY-MM-DD
  value: integer('value').notNull(),             // minor units; magnitude of the balance (liabilities stored positive)
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  uniqAccountDate: uniqueIndex('account_balance_account_date').on(t.accountId, t.asOfDate),
}))

export type Account = typeof account.$inferSelect
export type AccountBalance = typeof accountBalance.$inferSelect
