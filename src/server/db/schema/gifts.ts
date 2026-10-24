import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { household } from './tenancy'

// ---------------------------------------------------------------------------
// Gifts — occasions (Christmas, birthdays) → the people being bought for →
// their gifts. Standalone: deliberately not linked to pots or spending.
// Recipients are free text, not members; most of them live outside the house.
// ---------------------------------------------------------------------------

export const giftOccasion = pgTable('gift_occasion', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  date: text('date'),                            // YYYY-MM-DD, optional
  budget: integer('budget'),                     // minor units; null = no overall budget
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('gift_occasion_household_id_idx').on(t.householdId),
}))

export const giftRecipient = pgTable('gift_recipient', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  occasionId: text('occasion_id').notNull().references(() => giftOccasion.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  budget: integer('budget'),                     // minor units; null = no per-person budget
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('gift_recipient_household_id_idx').on(t.householdId),
  occasionIdx: index('gift_recipient_occasion_id_idx').on(t.occasionId),
}))

export const gift = pgTable('gift', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => giftRecipient.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: integer('amount').notNull(),           // minor units; the price
  status: text('status').notNull(),              // 'idea' | 'bought' | 'given'
  link: text('link'),                            // URL or shop name
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('gift_household_id_idx').on(t.householdId),
  recipientIdx: index('gift_recipient_id_idx').on(t.recipientId),
}))

export type GiftOccasion = typeof giftOccasion.$inferSelect
export type GiftRecipient = typeof giftRecipient.$inferSelect
export type Gift = typeof gift.$inferSelect
