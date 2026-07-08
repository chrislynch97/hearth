import { eq } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { household, member } from '../db/schema'
import { needsSetup } from '../../shared/setup'

export const bootstrapRouter = router({
  context: publicProcedure.query(async ({ ctx }) => {
    const [hh] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
    const members = await ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId))
    return { household: hh, members, needsSetup: needsSetup(hh) }
  }),
})
