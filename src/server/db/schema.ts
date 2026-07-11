import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Multi-tenancy model (see the households plan)
// ---------------------------------------------------------------------------
// `household` is the TENANT. Every domain table below carries a `householdId`
// so one database can hold many households in isolation. Tenant scoping is
// enforced in the app layer (a scoped-query helper keyed on the request's
// active household), which is the common denominator across SQLite (now) and
// Postgres/RLS (later). Because these `household_id` columns were added to
// existing tables via ALTER TABLE, they carry a DEFAULT of 'household' (the id
// of the original singleton) so the migration backfills the sole tenant, and
// deliberately have no SQL-level foreign key (SQLite forbids adding a NOT NULL
// FK column to a populated table) — they are logical FKs.
//
// `user` is a global LOGIN identity; `membership` grants a user access to a
// household with a role. This is distinct from `member` (a budgeting
// participant: a person or the shared 'joint' entity), which owns pots, spends,
// payslips etc. A member may be linked to a user (member.userId) but need not
// be — the 'joint' member has no login, and a viewer user may have no member.
// ---------------------------------------------------------------------------

export const household = sqliteTable('household', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull().default('My Household'),
  currencyCode: text('currency_code').notNull().default('GBP'),
  currencySymbol: text('currency_symbol').notNull().default('£'),
  currencyDecimalPlaces: integer('currency_decimal_places').notNull().default(2),
  // How the symbol and number are laid out — independent of `locale`, which only
  // drives date formatting. 'prefix' = £1,234.56; 'suffix' = 1.234,56 € (with a
  // space). Separators are stored explicitly so a Euro household can pick the
  // German 1.234,56 shape without us guessing from locale.
  currencySymbolPosition: text('currency_symbol_position').notNull().default('prefix'), // 'prefix' | 'suffix'
  currencyGroupSeparator: text('currency_group_separator').notNull().default(','),      // thousands separator ('' = none)
  currencyDecimalSeparator: text('currency_decimal_separator').notNull().default('.'),
  locale: text('locale').notNull().default('en-GB'),
  budgetPeriodStartDay: integer('budget_period_start_day').notNull().default(1),
  // Period *length*. 'monthly' keeps the calendar-month behaviour anchored on
  // budget_period_start_day; the weekly cycles step in whole weeks from
  // budget_period_anchor (a reference start date). See src/shared/period.ts.
  budgetPeriodFrequency: text('budget_period_frequency').notNull().default('monthly'), // 'monthly' | 'four_weekly' | 'fortnightly' | 'weekly'
  budgetPeriodAnchor: text('budget_period_anchor'), // YYYY-MM-DD reference start for non-monthly cycles; null for monthly
  // Authentication (password + MFA) now lives on `user`, not the household. The
  // legacy household columns were migrated onto the owner user and dropped
  // (migration 0017).
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

// A login identity. Global (not scoped to a household); reaches households via
// `membership`. Local/self-host installs are username-only — `email` is optional
// and only needed later for cloud invites / password reset. `passwordHash` is
// nullable so a user can be provisioned before a password is set.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  mfaSecret: text('mfa_secret'),
  mfaEnabledAt: integer('mfa_enabled_at'),
  mfaRecoveryCodes: text('mfa_recovery_codes'),
  // The last TOTP time-step accepted at login. Steps <= this are rejected so a
  // captured code can't be replayed within its ±1-step validity window.
  mfaLastStep: integer('mfa_last_step'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// Grants a user access to a household, with a role. `invitedAt`/`acceptedAt`
// support an invite flow (pending = invited, not yet accepted).
export const membership = sqliteTable('membership', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member' | 'viewer'
  invitedAt: integer('invited_at'),
  acceptedAt: integer('accepted_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  uniqUserHousehold: uniqueIndex('membership_user_household').on(t.userId, t.householdId),
}))

// A logged-in session. The cookie holds this row's id; each request resolves the
// user and their active household from it. Server-side (unlike the old stateless
// shared-password token) so it carries user identity and supports logout,
// multiple users, and a per-session active household. Not part of the data
// portability contract — deliberately excluded from ALL_TABLES.
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeHouseholdId: text('active_household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

export type Session = typeof session.$inferSelect

// Instance-wide settings (a single row, id = 'instance'), distinct from the
// per-household settings on `household`. Governs deployment-level behaviour like
// whether anyone can self-register a new household. Not part of the data
// portability contract — deliberately excluded from ALL_TABLES.
export const instanceSettings = sqliteTable('instance_settings', {
  id: text('id').primaryKey(),
  // 0/1: when on, `auth.register` lets anyone create an account + their own
  // household. Off by default so a self-host stays invite-only until opted in.
  allowOpenRegistration: integer('allow_open_registration').notNull().default(0),
  // The instance operator: the single user who controls instance-wide actions
  // (full export/import/reset, open registration) and whose account gates
  // login. Stored explicitly (a logical FK to `user.id`, nullable) so owner
  // identity never has to be inferred from a magic household id — which failed
  // to resolve, and silently fell open, on any install whose primary household
  // isn't literally id 'household'. Backfilled by `ensureSeed`.
  ownerUserId: text('owner_user_id'),
  // 0/1: when on, the instance is "locked" — every request must carry a valid
  // session. Persisted rather than re-derived from the owner's password each
  // request, so a lookup that can't find the owner fails CLOSED (stays locked)
  // instead of open. Kept in sync whenever the owner's password is set/cleared.
  authRequired: integer('auth_required').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type InstanceSettings = typeof instanceSettings.$inferSelect

// A pending invitation for someone to join a household. The row id is the
// unguessable invite token; accepting it creates the user + membership.
export const invitation = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'admin' | 'member' | 'viewer'
  email: text('email'), // optional, informational (who it was sent to)
  invitedByUserId: text('invited_by_user_id').references(() => user.id),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  acceptedAt: integer('accepted_at'),
})

export type Invitation = typeof invitation.$inferSelect

// A budgeting participant within a household: a person, or the shared 'joint'
// entity. `userId` optionally links a participant to a login identity.
export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  userId: text('user_id'), // optional link to a login identity; null for 'joint' and unlinked people
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
export type User = typeof user.$inferSelect
export type Membership = typeof membership.$inferSelect
export type Member = typeof member.$inferSelect

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const pot = sqliteTable('pot', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  // Import dedup is household-scoped (imports.ts filters by householdId), so the
  // uniqueness must be too — a global unique made two households importing the
  // same Monzo transaction id collide with a raw SQLite error.
  uniqImportRef: uniqueIndex('spend_transaction_import_ref').on(t.householdId, t.importRef),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
  householdId: text('household_id').notNull(),
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
