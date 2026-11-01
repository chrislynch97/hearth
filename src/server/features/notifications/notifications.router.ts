import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { pushSubscription } from '../../db/schema'
import { pushConfig } from '../../notifications/config'
import { isPushEndpoint, sendPushToUser } from '../../notifications/push'
import { newId } from '@shared/ids'

const requireUser = (userId: string | undefined): string => {
  if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  return userId
}

export const notificationsRouter = router({
  /** Whether this instance can send notifications, and the key a browser
   *  subscribes with. */
  config: publicProcedure.query(() => {
    const config = pushConfig()
    return { enabled: config !== null, publicKey: config?.publicKey ?? null }
  }),

  /** Opt this browser in. A browser has one endpoint, so a second login on it
   *  takes the row over rather than leaving the first still receiving. */
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
      await ctx.db
        .insert(pushSubscription)
        .values({ id: newId(), userId, endpoint: input.endpoint, ...input.keys, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: { userId, ...input.keys, updatedAt: now },
        })
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
    const sent = await sendPushToUser(ctx.db, requireUser(ctx.userId), {
      title: 'Hearth',
      body: 'Notifications are working.',
      url: '/',
    })
    return { sent }
  }),
})
