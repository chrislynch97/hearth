import { pgTable, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Postgres port — see issue #25.
// ---------------------------------------------------------------------------
// Column names are kept byte-identical to the old SQLite schema. Type choices:
//   * Every `*At` column is `timestamptz` (mode: 'date') — a real Postgres
//     timestamp, not an epoch-millis integer. This is the long-term-correct
//     storage type (psql readability, SQL date math, BI tooling) and also
//     sidesteps the INT4 overflow that epoch-millis (~1.75e12) would hit. The
//     app works with JS `Date` objects end to end; they cross tRPC as real
//     Dates via the superjson transformer (see trpc/trpc.ts + client/main.tsx).
//     The JSON export/backup format deliberately stays epoch-millis NUMBERS
//     (converted at the snapshot boundary, db/snapshot.ts) so exports remain
//     engine-agnostic and older SQLite exports still import unchanged.
//   * Booleans stay `integer` 0/1 and JSON stays `text`, exactly as under
//     SQLite — the app reads/writes them that way throughout, so keeping the
//     representation avoids a stack-wide churn for no near-term gain.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Multi-tenancy model (see the households plan)
// ---------------------------------------------------------------------------
// `household` is the TENANT. Every domain table below carries a `householdId`
// so one database can hold many households in isolation. Tenant scoping is
// enforced in the app layer (a scoped-query helper keyed on the request's
// active household). Under Postgres these `household_id` columns are now REAL
// foreign keys (onDelete cascade) with an index each — deleting a household
// cascades to its data, and per-tenant queries no longer full-scan. (Under
// SQLite they were logical-only: FK enforcement was never enabled on the
// libsql connection and ALTER TABLE couldn't add a NOT NULL FK to a populated
// table.)
//
// `user` is a global LOGIN identity; `membership` grants a user access to a
// household with a role. This is distinct from `member` (a budgeting
// participant: a person or the shared 'joint' entity), which owns pots, spends,
// payslips etc. A member may be linked to a user (member.userId) but need not
// be — the 'joint' member has no login, and a viewer user may have no member.
// ---------------------------------------------------------------------------

export const household = pgTable('household', {
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
  backupLastAt: timestamp('backup_last_at', { withTimezone: true, mode: 'date' }),
  // Audit-log retention window in days (issue #41). 0 = keep forever (the
  // default); N>0 prunes entries older than N days, both on the manual
  // `audit.prune` and via the hourly background pruner (audit/prune.ts). Pruning
  // is the one sanctioned bulk-delete on the otherwise append-only trail.
  auditRetentionDays: integer('audit_retention_days').notNull().default(0),
  // Archive-before-prune toggle (issue #43). 0 = hard-delete (the default,
  // matching #41's behaviour); 1 = export the to-be-pruned range to an
  // owner-only JSON file (audit/archive.ts) before deleting, so the trail is
  // preserved rather than silently dropped. Boolean stored 0/1 per this file's
  // convention. Applies to both the manual `audit.prune` and the hourly pruner.
  auditPruneArchive: integer('audit_prune_archive').notNull().default(0),
  setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true, mode: 'date' }),
  incomeBasisDefault: text('income_basis_default').notNull().default('regular_net'),
  jointContributionBasis: text('joint_contribution_basis').notNull().default('equal'),
  // Emergency fund target = this many months of essential bills (spec: 3 months rule of thumb).
  emergencyFundMonths: integer('emergency_fund_months').notNull().default(3),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})

// A login identity. Global (not scoped to a household); reaches households via
// `membership`. Local/self-host installs are username-only — `email` is optional
// and only needed later for cloud invites / password reset. `passwordHash` is
// nullable so a user can be provisioned before a password is set.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  mfaSecret: text('mfa_secret'),
  mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true, mode: 'date' }),
  mfaRecoveryCodes: text('mfa_recovery_codes'),
  // The last TOTP time-step accepted at login. Steps <= this are rejected so a
  // captured code can't be replayed within its ±1-step validity window.
  mfaLastStep: integer('mfa_last_step'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})

// Grants a user access to a household, with a role. `invitedAt`/`acceptedAt`
// support an invite flow (pending = invited, not yet accepted).
export const membership = pgTable('membership', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member' | 'viewer'
  invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqUserHousehold: uniqueIndex('membership_user_household').on(t.userId, t.householdId),
  householdIdx: index('membership_household_id_idx').on(t.householdId),
}))

// A logged-in session. The cookie holds a 256-bit random token; this row's id is
// its sha256, so a leaked database/backup exposes only hashes, not live login
// tokens (the raw token is never persisted). Each request hashes the presented
// cookie and resolves the user + active household from the matching row.
// Server-side (unlike the old stateless shared-password token) so it carries
// user identity and supports logout, multiple users, and a per-session active
// household. Not part of the data portability contract — excluded from ALL_TABLES.
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeHouseholdId: text('active_household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  // Idle deadline: slides forward on use (see touchSession). A session is dead
  // once EITHER this or absoluteExpiresAt has passed.
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  // Hard ceiling set at creation and never moved, so an attacker holding a cookie
  // they keep warm still gets forced back to the login screen eventually.
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  // Last time this session was seen, updated lazily (TOUCH_INTERVAL_MS). Drives
  // the sliding expiry and gives sessions.list something to sort/label by.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
  // Coarse provenance so a user reviewing sessions.list can recognise their own
  // devices and spot one they don't. Captured at creation and never updated: they
  // describe where the session was *established*, which is what identifies it.
  userAgent: text('user_agent'),
  ip: text('ip'),
}, (t) => ({
  userIdx: index('session_user_id_idx').on(t.userId),
}))

export type Session = typeof session.$inferSelect

// Instance-wide settings (a single row, id = 'instance'), distinct from the
// per-household settings on `household`. Governs deployment-level behaviour like
// whether anyone can self-register a new household. Not part of the data
// portability contract — deliberately excluded from ALL_TABLES.
export const instanceSettings = pgTable('instance_settings', {
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export type InstanceSettings = typeof instanceSettings.$inferSelect

// A pending invitation for someone to join a household. The row id is an opaque,
// non-secret identifier (safe to list and revoke by); the shareable invite token
// itself is a separate 256-bit random value stored only as its sha256 in
// `tokenHash`. Accepting a token hashes it, matches the row, and creates the
// user + membership. The raw token is shown once at creation and never persisted.
export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'admin' | 'member' | 'viewer'
  email: text('email'), // optional, informational (who it was sent to)
  invitedByUserId: text('invited_by_user_id').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
}, (t) => ({
  householdIdx: index('invitation_household_id_idx').on(t.householdId),
  tokenHashIdx: index('invitation_token_hash_idx').on(t.tokenHash),
}))

export type Invitation = typeof invitation.$inferSelect

// A budgeting participant within a household: a person, or the shared 'joint'
// entity. `userId` optionally links a participant to a login identity.
export const member = pgTable('member', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  userId: text('user_id'), // optional link to a login identity; null for 'joint' and unlinked people
  kind: text('kind').notNull(), // 'person' | 'joint'
  displayName: text('display_name').notNull(),
  shortLabel: text('short_label'),
  color: text('color'),
  jointContributionWeight: integer('joint_contribution_weight'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('member_household_id_idx').on(t.householdId),
}))

export type Household = typeof household.$inferSelect
export type User = typeof user.$inferSelect
export type Membership = typeof membership.$inferSelect
export type Member = typeof member.$inferSelect

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

export type Expense = typeof expense.$inferSelect
export type ExpenseShare = typeof expenseShare.$inferSelect

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
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('set_aside_household_id_idx').on(t.householdId),
}))

export type SetAside = typeof setAside.$inferSelect

export const reconciliationBatch = pgTable('reconciliation_batch', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  potId: text('pot_id').references(() => pot.id), // null = mixed/multi-pot
  ownerId: text('owner_id').references(() => member.id), // the payer this batch settled; null = whole-pot / legacy
  totalAmount: integer('total_amount').notNull(),
  transactionCount: integer('transaction_count').notNull(),
  reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('reconciliation_batch_household_id_idx').on(t.householdId),
}))

// Import batches — one Monzo CSV upload (spec §5.3). Preserved for audit and
// so a whole import can be identified (and, in future, reversed).
export const importBatch = pgTable('import_batch', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),        // 'monzo_csv'
  filename: text('filename'),
  rowCount: integer('row_count').notNull(),        // rows in the file
  importedCount: integer('imported_count').notNull(),
  skippedCount: integer('skipped_count').notNull(),
  mapping: text('mapping'),                 // JSON: column mapping used
  importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('import_batch_household_id_idx').on(t.householdId),
}))

export const spendTransaction = pgTable('spend_transaction', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
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
  reconciledAt: timestamp('reconciled_at', { withTimezone: true, mode: 'date' }),
  reconciliationBatchId: text('reconciliation_batch_id').references(() => reconciliationBatch.id),
  source: text('source').notNull().default('manual'), // 'manual' | 'import'
  importRef: text('import_ref'),                       // Monzo Transaction ID; unique dedup key (NULL for manual)
  importBatchId: text('import_batch_id').references(() => importBatch.id),
  raw: text('raw'),                                    // JSON of the original imported row
  splitGroupId: text('split_group_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  // Import dedup is household-scoped (imports.ts filters by householdId), so the
  // uniqueness must be too — a global unique made two households importing the
  // same Monzo transaction id collide with a raw SQLite error.
  uniqImportRef: uniqueIndex('spend_transaction_import_ref').on(t.householdId, t.importRef),
  householdIdx: index('spend_transaction_household_id_idx').on(t.householdId),
}))

export type ReconciliationBatch = typeof reconciliationBatch.$inferSelect
export type SpendTransaction = typeof spendTransaction.$inferSelect
export type ImportBatch = typeof importBatch.$inferSelect

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
