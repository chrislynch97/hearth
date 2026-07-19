import { z } from 'zod'
import { eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { expense, setAside, household, member, pot } from '../db/schema'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember } from '../income/service'
import { projectUpcoming, type UpcomingExpenseInput } from '../plan/upcoming'
import { periodConfig } from '../../shared/period'
import { addDays, todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export const planRouter = router({
  funding: publicProcedure.query(async ({ ctx }) => {
    const pots = await ctx.db
      .select()
      .from(pot)
      .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))

    const expenses = await ctx.db
      .select()
      .from(expense)
      .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

    const members = await ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId, isNull(member.archivedAt)))
    const incomeByMember = await computeIncomeByMember(ctx.db, ctx.householdId)

    const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
    const jointContributionBasis = (householdRow?.jointContributionBasis ?? 'equal') as
      | 'equal'
      | 'income_proportional'
      | 'custom'
    const jointFundingModel = (householdRow?.jointFundingModel ?? 'split') as 'split' | 'pooled'

    const setAsides = await ctx.db
      .select()
      .from(setAside)
      .where(scopeWhere(ctx.householdId, setAside.householdId, isNull(setAside.archivedAt), eq(setAside.active, 1)))

    return computeFundingPlan({
      pots: pots.map((p) => ({
        id: p.id,
        name: p.name,
        ownerId: p.ownerId,
      })),
      bills: expenses.map((e) => ({
        recurrence: e.recurrence as Recurrence,
        active: e.active === 1,
        funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
        potId: e.potId,
        categoryId: e.categoryId,
        amount: e.amount ?? 0,
        includeInEmergencyFund: e.includeInEmergencyFund === 1,
      })),
      setAsides: setAsides.map((s) => ({
        recurrence: s.recurrence as Recurrence,
        active: s.active === 1,
        potId: s.potId,
        amount: s.amount,
        includeInEmergencyFund: s.includeInEmergencyFund === 1,
      })),
      members: members.map((m) => ({
        id: m.id,
        kind: m.kind as 'person' | 'joint',
        displayName: m.displayName,
        jointContributionWeight: m.jointContributionWeight,
        monthlyIncome: incomeByMember.get(m.id)?.monthlyIncome ?? 0,
      })),
      jointContributionBasis,
      jointFundingModel,
      frequency: periodConfig(householdRow ?? 1).frequency,
      emergencyFundMonths: householdRow?.emergencyFundMonths ?? 3,
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
        .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

      const upcomingExpenses: UpcomingExpenseInput[] = expenses.map((e) => ({
        id: e.id,
        name: e.name,
        recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
        dueAnchor: e.dueAnchor,
        amount: e.amount ?? 0,
        reminderDays: e.dueReminderDays,
      }))

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
        .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

      const billById = new Map(expenses.map((e) => [e.id, e]))
      const upcomingExpenses: UpcomingExpenseInput[] = expenses.map((e) => ({
        id: e.id,
        name: e.name,
        recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
        dueAnchor: e.dueAnchor,
        amount: e.amount ?? 0,
        reminderDays: e.dueReminderDays,
      }))

      return projectUpcoming({ expenses: upcomingExpenses, from, to })
        .map((o) => {
          const bill = billById.get(o.expenseId)
          // A bill is single-pot now; prefilling a spend needs its funding shape, not owner shares.
          // funding 'pot_auto' or 'main' → the spend is settled at source (no catch-up).
          const funding = (bill?.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main'
          return {
            key: `${o.expenseId}:${o.date}`,
            expenseId: o.expenseId,
            name: o.name,
            date: o.date,
            daysUntil: daysBetweenIso(today, o.date),
            recurrence: (bill?.recurrence ?? 'monthly') as 'monthly' | 'quarterly' | 'yearly',
            totalAmount: o.amount,
            funding,
            potId: bill?.potId ?? null,
            categoryId: bill?.categoryId ?? null,
            settledAtSource: funding !== 'pot_manual',
          }
        })
        .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil) || a.name.localeCompare(b.name))
    }),
})
