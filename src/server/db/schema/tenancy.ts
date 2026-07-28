import { pgTable, text, integer, timestamp, uniqueIndex, index, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core'

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
  // How joint costs are funded (issue #87). 'split' = joint costs divided per
  // person by jointContributionBasis (the deficit-prone default); 'pooled' =
  // each person contributes their whole remainder into joint, which then covers
  // the joint costs. 'split' by default to preserve existing behaviour.
  jointFundingModel: text('joint_funding_model').notNull().default('split'), // 'split' | 'pooled'
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
  // When the address above was proven to belong to this account by clicking a
  // link sent to it (#111). Null = unproven, which is every address entered by
  // an admin on an invite or typed into the profile form. Password reset only
  // ever mails a proven address, so a typo can't hand recovery to a stranger.
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
  mfaSecret: text('mfa_secret'),
  mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true, mode: 'date' }),
  mfaRecoveryCodes: text('mfa_recovery_codes'),
  // The last TOTP time-step accepted at login. Steps <= this are rejected so a
  // captured code can't be replayed within its ±1-step validity window.
  mfaLastStep: integer('mfa_last_step'),
  // When the user dismissed the first-run getting-started checklist (#62). Once
  // set, the checklist stays gone for that account across browsers and devices.
  onboardingDismissedAt: timestamp('onboarding_dismissed_at', { withTimezone: true, mode: 'date' }),
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

// Sliding-window rate-limit / lockout state (issue #112). Shared across replicas
// so N instances grant one attempt budget between them, and a restart doesn't
// hand an attacker a clean slate. Ephemeral, instance-level bookkeeping — no
// household scope, and deliberately excluded from ALL_TABLES.
export const rateLimit = pgTable('rate_limit', {
  // Which limiter the row belongs to (login, register, …). Namespaces the key:
  // two limiters throttling the same IP must not share a counter.
  limiter: text('limiter').notNull(),
  // What is being throttled — a client IP, username, or user id, per limiter.
  key: text('key').notNull(),
  count: integer('count').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  // Null until the key trips the cap; the block lifts once this passes.
  blockedUntil: timestamp('blocked_until', { withTimezone: true, mode: 'date' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.limiter, t.key] }),
  // Supports the periodic sweep of expired rows.
  sweepIdx: index('rate_limit_sweep_idx').on(t.limiter, t.windowStart),
}))

// A single-use token emailed to an address to prove something about it (#111):
// that the address belongs to the account (`email_verify`), or that whoever
// reads it may set a new password (`password_reset`). Like sessions and invites,
// only the sha256 of the 256-bit random token is stored, so a leaked database or
// backup exposes no usable credential. Short-lived, single-use bookkeeping — no
// household scope, and deliberately excluded from ALL_TABLES.
export const emailToken = pgTable('email_token', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(), // 'email_verify' | 'password_reset'
  // The address the token was sent to, captured at issue time. A verification
  // token must only confirm the address it was mailed to — otherwise changing
  // the address after requesting one would verify the new address by proxy.
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
}, (t) => ({
  tokenHashIdx: index('email_token_token_hash_idx').on(t.tokenHash),
  userPurposeIdx: index('email_token_user_purpose_idx').on(t.userId, t.purpose),
}))

export type EmailToken = typeof emailToken.$inferSelect

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
  // Self-host update preferences (issue #81). 0/1 booleans per the table's
  // convention. autoPoll: check GitHub for new releases in the background so the
  // app can surface an "update available" banner (on by default — an instance
  // checking its own project's releases). preUpdateBackup: run a backup before
  // applying an update (on by default). autoUpdate: apply updates automatically;
  // only effective on the managed image deploy (needs the host updater).
  autoPoll: integer('auto_poll').notNull().default(1),
  preUpdateBackup: integer('pre_update_backup').notNull().default(1),
  autoUpdate: integer('auto_update').notNull().default(0),
  // Local "HH:MM" for the daily auto-update window; null ⇒ apply as soon as an
  // update is detected. updateLastAppliedDate is a local "YYYY-MM-DD" once-per-day
  // guard so a scheduled auto-update fires at most once per calendar day.
  autoUpdateTime: text('auto_update_time'),
  updateLastAppliedDate: text('update_last_applied_date'),
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
  // Optionally ties the invite to an existing (unlinked) budgeting member so the
  // invitee's account is auto-linked to it on acceptance. ON DELETE SET NULL so a
  // member removed between creation and acceptance just falls back to no-link.
  memberId: text('member_id').references((): AnyPgColumn => member.id, { onDelete: 'set null' }),
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
