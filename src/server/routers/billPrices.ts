import { z } from 'zod'
import { asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { billPrice } from '../db/schema'

export const billPricesRouter = router({
  // Effective-dated price history (issue #68). Optionally scoped to one bill;
  // ordered oldest-first so a caller can read the trend directly.
  list: publicProcedure
    .input(z.object({ expenseId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(billPrice)
        .where(scopeWhere(ctx.householdId, billPrice.householdId))
        .orderBy(asc(billPrice.effectiveDate), asc(billPrice.createdAt))
      return input?.expenseId ? rows.filter((r) => r.expenseId === input.expenseId) : rows
    }),
})
