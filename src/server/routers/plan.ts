import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { expense, expenseShare, household, member, pot } from '../db/schema'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember } from '../income/service'
import { projectUpcoming, type UpcomingExpenseInput } from '../plan/upcoming'
import { addDays, todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

const HOUSEHOLD_ID = 'household'

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export const planRouter = router({
  funding: publicProcedure.query(async ({ ctx }) => {
    const pots = await ctx.db.select().from(pot).where(isNull(pot.archivedAt))

    const expenses = await ctx.db
      .select()
      .from(expense)
      .where(and(isNull(expense.archivedAt), eq(expense.active, 1)))

    const members = await ctx.db.select().from(member).where(isNull(member.archivedAt))
    const incomeByMember = await computeIncomeByMember(ctx.db)

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
      })),
      expenses: expenseInputs,
      members: members.map((m) => ({
        id: m.id,
        kind: m.kind as 'person' | 'joint',
        displayName: m.displayName,
        jointContributionWeight: m.jointContributionWeight,
        monthlyIncome: incomeByMember.get(m.id)?.monthlyIncome ?? 0,
      })),
      jointContributionBasis,
    })
  }),

  /** Projected bill cash-outs over a horizon (spec §5.1), for the Upcoming page. */
  upcoming: publicProcedure
    .input(z.object({ horizonDays: z.number().int().min(1).max(365).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const today = todayIso()
      const horizon = input?.horizonDays ?? 60

      const expenses = await ctx.db
        .select()
        .from(expense)
        .where(and(isNull(expense.archivedAt), eq(expense.active, 1)))

      const upcomingExpenses: UpcomingExpenseInput[] = []
      for (const e of expenses) {
        const shares = await ctx.db.select().from(expenseShare).where(eq(expenseShare.expenseId, e.id))
        upcomingExpenses.push({
          id: e.id,
          name: e.name,
          recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
          dueAnchor: e.dueAnchor,
          amount: shares.reduce((acc, s) => acc + s.amount, 0),
          reminderDays: e.dueReminderDays,
        })
      }

      return {
        from: today,
        to: addDays(today, horizon),
        payments: projectUpcoming({ expenses: upcomingExpenses, from: today, to: addDays(today, horizon) }),
      }
    }),

  /** Outgoings whose due date falls in a window around today (recent past +
   *  near future), each with its per-owner shares, so a spend can be logged
   *  straight from one. Powers the "log a regular outgoing" picker on the
   *  Spending page. Ordered nearest-to-today first. */
  recentlyDue: publicProcedure
    .input(
      z
        .object({
          lookbackDays: z.number().int().min(0).max(365).optional(),
          lookaheadDays: z.number().int().min(0).max(365).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const today = todayIso()
      const from = addDays(today, -(input?.lookbackDays ?? 45))
      const to = addDays(today, input?.lookaheadDays ?? 14)

      const expenses = await ctx.db
        .select()
        .from(expense)
        .where(and(isNull(expense.archivedAt), eq(expense.active, 1)))

      const sharesByExpense = new Map<string, Array<{ ownerId: string; potId: string | null; amount: number }>>()
      const upcomingExpenses: UpcomingExpenseInput[] = []
      for (const e of expenses) {
        const shares = await ctx.db.select().from(expenseShare).where(eq(expenseShare.expenseId, e.id))
        sharesByExpense.set(
          e.id,
          shares.map((s) => ({ ownerId: s.ownerId, potId: s.potId, amount: s.amount })),
        )
        upcomingExpenses.push({
          id: e.id,
          name: e.name,
          recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
          dueAnchor: e.dueAnchor,
          amount: shares.reduce((acc, s) => acc + s.amount, 0),
          reminderDays: e.dueReminderDays,
        })
      }

      return projectUpcoming({ expenses: upcomingExpenses, from, to })
        .map((o) => ({
          key: `${o.expenseId}:${o.date}`,
          expenseId: o.expenseId,
          name: o.name,
          date: o.date,
          daysUntil: daysBetweenIso(today, o.date),
          totalAmount: o.amount,
          shares: sharesByExpense.get(o.expenseId) ?? [],
        }))
        .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil) || a.name.localeCompare(b.name))
    }),
})
