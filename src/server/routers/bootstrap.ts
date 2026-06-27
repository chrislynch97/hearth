import { router, publicProcedure } from '../trpc/trpc'
import { household, member } from '../db/schema'
import { needsSetup } from '../../shared/setup'

export const bootstrapRouter = router({
  context: publicProcedure.query(async ({ ctx }) => {
    const [hh] = await ctx.db.select().from(household)
    const members = await ctx.db.select().from(member)
    return { household: hh, members, needsSetup: needsSetup(hh) }
  }),
})
