import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { user } from './tenancy'

// One row per browser that has opted in to Web Push. Belongs to the login, not a
// household: a device is someone's phone, whichever household they're looking at.
export const pushSubscription = pgTable('push_subscription', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),  // the push service URL for this browser
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  // No FK: expiry must not silently stop an installed app, only ending a session
  // does. Null on an open instance, which has no sessions.
  sessionId: text('session_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  userIdx: index('push_subscription_user_id_idx').on(t.userId),
}))

export type PushSubscriptionRow = typeof pushSubscription.$inferSelect
