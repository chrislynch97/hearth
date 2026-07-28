import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { feedbackConfig, feedbackLimiter, submitFeedback } from './feedback'
import { getUser } from '../../auth/session'

export const feedbackRouter = router({
  /** Whether in-app feedback is available and, if so, where reports go — so the
   *  client only shows the entry point when it's configured. */
  config: publicProcedure.query(() => feedbackConfig()),

  /** File a GitHub issue from an in-app bug report / idea. Open to any signed-in
   *  user (viewers included) — hence WRITE_ROLE_EXEMPT — and throttled per user
   *  against spam. */
  submit: publicProcedure
    .input(
      z.object({
        kind: z.enum(['bug', 'idea']),
        title: z.string().trim().min(3).max(160),
        description: z.string().trim().min(10).max(4000),
        route: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!feedbackConfig().enabled) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Feedback is not configured on this instance.',
        })
      }
      if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })

      const now = Date.now()
      if (!(await feedbackLimiter.check(ctx.db, ctx.userId, now)).allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'You’ve sent a few reports just now — try again in a little while.',
        })
      }
      await feedbackLimiter.fail(ctx.db, ctx.userId, now)

      const u = await getUser(ctx.db, ctx.userId)
      try {
        return await submitFeedback({
          kind: input.kind,
          title: input.title,
          description: input.description,
          route: input.route,
          submittedBy: u?.displayName || u?.username,
        })
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: e instanceof Error ? e.message : 'Could not send your report.',
        })
      }
    }),
})
