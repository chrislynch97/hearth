import { and, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { expense, expenseShare, household, member, pot } from '../db/schema'
import { computeFundingPlan } from '../plan/funding'
import type { Recurrence } from '../../shared/recurrence'

const HOUSEHOLD_ID = 'household'

export const planRouter = router({
  funding: publicProcedure.query(async ({ ctx }) => {
    const pots = await ctx.db.select().from(pot).where(isNull(pot.archivedAt))

    const expenses = await ctx.db
      .select()
      .from(expense)
      .where(and(isNull(expense.archivedAt), eq(expense.active, 1)))

    const members = await ctx.db.select().from(member).where(isNull(member.archivedAt))

    const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
    const jointContributionBasis = (householdRow?.jointContributionBasis ?? 'equal') as
      | 'equal'
      | 'income_proportional'
      | 'custom'

    const expenseInputs = []
    for (const e of expenses) {
      const shares = await ctx.db.select().from(expenseShare).where(eq(expenseShare.expenseId, e.id))
      expenseInputs.push({
        recurrence: e.recurrence as Recurrence,
        active: e.active === 1,
        shares: shares.map((s) => ({ ownerId: s.ownerId, amount: s.amount, potId: s.potId })),
      })
    }

    return computeFundingPlan({
      pots: pots.map((p) => ({
        id: p.id,
        name: p.name,
        ownerId: p.ownerId,
        isDrawdown: p.isDrawdown === 1,
      })),
      expenses: expenseInputs,
      members: members.map((m) => ({
        id: m.id,
        kind: m.kind as 'person' | 'joint',
        displayName: m.displayName,
        jointContributionWeight: m.jointContributionWeight,
      })),
      jointContributionBasis,
    })
  }),
})
