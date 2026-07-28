import { eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { pot, payslip, setAside, user } from '../../db/schema'
import { getUser } from '../../auth/session'

export const onboardingRouter = router({
  /** First-run getting-started checklist state (#62): whether the user has hidden
   *  it, and which orientation steps their household has already completed. Steps
   *  are derived live from the data, so they tick off on their own as the user
   *  fills the household in. */
  status: publicProcedure.query(async ({ ctx }) => {
    // Anonymous callers (a locked instance with no session) never see the
    // checklist — there is no account to remember a dismissal against.
    if (!ctx.userId) {
      return { dismissed: true, steps: { pots: false, payslips: false, setAsides: false } }
    }
    const u = await getUser(ctx.db, ctx.userId)
    const [pots, payslips, setAsides] = await Promise.all([
      ctx.db
        .select({ one: pot.id })
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))
        .limit(1),
      ctx.db.select({ one: payslip.id }).from(payslip).where(scopeWhere(ctx.householdId, payslip.householdId)).limit(1),
      ctx.db
        .select({ one: setAside.id })
        .from(setAside)
        .where(scopeWhere(ctx.householdId, setAside.householdId, isNull(setAside.archivedAt)))
        .limit(1),
    ])
    return {
      dismissed: u?.onboardingDismissedAt != null,
      steps: { pots: pots.length > 0, payslips: payslips.length > 0, setAsides: setAsides.length > 0 },
    }
  }),

  /** Hide the checklist for good. Persisted on the user account so it stays gone
   *  across browsers and devices. */
  dismiss: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    await ctx.db
      .update(user)
      .set({ onboardingDismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(user.id, ctx.userId))
    return { dismissed: true }
  }),
})
