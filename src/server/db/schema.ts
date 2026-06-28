import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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
