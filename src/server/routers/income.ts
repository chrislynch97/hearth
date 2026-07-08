import { isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { member } from '../db/schema'
import { computeIncomeByMember } from '../income/service'

export const incomeRouter = router({
  /** Per-member monthly income (salary + net income sources) plus the household total.
   *  This is the single figure all budgeting consumes (spec §5.4 / §6.3). */
  overview: publicProcedure.query(async ({ ctx }) => {
    const members = await ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId, isNull(member.archivedAt)))
    const incomeByMember = await computeIncomeByMember(ctx.db, ctx.householdId)

    const perMember = members.map((m) => {
      const income = incomeByMember.get(m.id)
      return {
        memberId: m.id,
        displayName: m.displayName,
        kind: m.kind as 'person' | 'joint',
        salaryMonthly: income?.salaryMonthly ?? 0,
        incomeSourceMonthly: income?.incomeSourceMonthly ?? 0,
        monthlyIncome: income?.monthlyIncome ?? 0,
      }
    })

    const householdMonthlyIncome = perMember.reduce((acc, m) => acc + m.monthlyIncome, 0)

    return { perMember, householdMonthlyIncome }
  }),
})
