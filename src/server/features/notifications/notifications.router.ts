import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { pushSubscription } from '../../db/schema'
import { RateLimiter } from '../../auth/rateLimit'
import { pushConfig } from '../../notifications/config'
import { isPushEndpoint, sendPushToUser } from '../../notifications/push'
import { newId } from '@shared/ids'

const requireUser = (userId: string | undefined): string => {
  if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  return userId
}

// A browser hands the server a new endpoint whenever it likes, so an account's rows
// would otherwise only ever grow. The ones it hasn't opened longest go first.
const MAX_DEVICES_PER_USER = 10

// Each test is an outbound call to a push service on a member's say-so.
const sendTestLimiter = new RateLimiter('push-send-test', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 20,
  blockMs: 60 * 60 * 1000,
})

export const notificationsRouter = router({
  /** Whether this instance can send notifications, and the key a browser
   *  subscribes with. */
  config: publicProcedure.query(() => {
    const config = pushConfig()
    return { enabled: config !== null, publicKey: config?.publicKey ?? null }
  }),

  /** Opt this browser in, and re-sent whenever the app opens. A browser has one
   *  endpoint, so a second login on it takes the row over rather than leaving the
   *  first still receiving. */
  subscribe: publicProcedure
    .input(
      z.object({
        endpoint: z.string().max(1024),
        keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.userId)
      if (!pushConfig()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Notifications are not set up on this server.' })
      }
      if (!isPushEndpoint(input.endpoint)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "This browser's push service isn't supported." })
      }
      const now = new Date()
      const sessionId = ctx.sessionId ?? null
      await ctx.db
        .insert(pushSubscription)
        .values({ id: newId(), userId, endpoint: input.endpoint, ...input.keys, sessionId, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: { userId, ...input.keys, sessionId, updatedAt: now },
        })
      const surplus = await ctx.db
        .select({ id: pushSubscription.id })
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, userId))
        .orderBy(desc(pushSubscription.updatedAt), desc(pushSubscription.id))
        .offset(MAX_DEVICES_PER_USER)
      if (surplus.length > 0) {
        await ctx.db.delete(pushSubscription).where(inArray(pushSubscription.id, surplus.map((row) => row.id)))
      }
      return { subscribed: true }
    }),

  unsubscribe: publicProcedure
    .input(z.object({ endpoint: z.string().max(1024) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUser(ctx.userId)
      await ctx.db
        .delete(pushSubscription)
        .where(and(eq(pushSubscription.endpoint, input.endpoint), eq(pushSubscription.userId, userId)))
      return { subscribed: false }
    }),

  /** Goes to the caller's own devices, so it can't be used to bother anyone else. */
  sendTest: publicProcedure.mutation(async ({ ctx }) => {
    const userId = requireUser(ctx.userId)
    const now = Date.now()
    if (!(await sendTestLimiter.check(ctx.db, userId, now)).allowed) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many test notifications. Try again later.' })
    }
    await sendTestLimiter.fail(ctx.db, userId, now)

    const sent = await sendPushToUser(ctx.db, userId, {
      title: 'Hearth',
      body: 'Notifications are working.',
      url: '/',
    })
    return { sent }
  }),
})
