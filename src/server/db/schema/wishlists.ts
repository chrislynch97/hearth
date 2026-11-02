import { sql } from 'drizzle-orm'
import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

// ---------------------------------------------------------------------------
// Wish lists — things the household wants to buy, ticked off as bought rather
// than deleted. Standalone like gifts: buying one touches no pot or spending. An
// item sits in at most one list; tags cut across lists and aren't shared with
// to-dos.
// ---------------------------------------------------------------------------

export const wishlist = pgTable('wishlist', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  // Set on create and never changed: the stable part of the list's URL
  // (`/wishlists/k3x9p2-kitchen`), so a rename can't break links.
  shortId: text('short_id').notNull(),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqShortId: uniqueIndex('wishlist_short_id').on(t.householdId, t.shortId),
  householdIdx: index('wishlist_household_id_idx').on(t.householdId),
}))

export const wishlistItem = pgTable('wishlist_item', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  listId: text('list_id').references(() => wishlist.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  link: text('link'),                            // URL or shop name
  price: integer('price'),                       // minor units, optional
  priority: text('priority').notNull().default('normal'), // see shared/priority.ts
  // A member, not a user: the joint entity and people with no login can want things.
  wantedById: text('wanted_by_id').references(() => member.id, { onDelete: 'set null' }),
  notes: text('notes'),
  boughtAt: timestamp('bought_at', { withTimezone: true, mode: 'date' }),
  boughtById: text('bought_by_id').references(() => member.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('wishlist_item_household_id_idx').on(t.householdId),
  listIdx: index('wishlist_item_household_list_idx').on(t.householdId, t.listId),
}))

// The tag's name lives on the row: the household's tags are whatever items carry,
// so one left on nothing simply stops existing.
export const wishlistItemTag = pgTable('wishlist_item_tag', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => wishlistItem.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqName: uniqueIndex('wishlist_item_tag_item_name').on(t.itemId, sql`lower(${t.name})`),
  householdIdx: index('wishlist_item_tag_household_id_idx').on(t.householdId),
}))

export type Wishlist = typeof wishlist.$inferSelect
export type WishlistItem = typeof wishlistItem.$inferSelect
