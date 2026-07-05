import { z } from 'zod'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { category, expense, expenseShare, household, member, pot, spendTransaction } from '../db/schema'
import { computeBacklog } from '../spending/backlog'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember, loadPayslipSummaries } from '../income/service'
import { allocationByCategory, monthlyNetTrend } from '../dashboard/summary'
import { projectUpcoming, type UpcomingExpenseInput } from '../plan/upcoming'
import { periodForDate } from '../../shared/period'
import { addDays, todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

const HOUSEHOLD_ID = 'household'
const UPCOMING_HORIZON_DAYS = 30

export const dashboardRouter = router({
  /** One aggregated call powering the home dashboard (spec §5.6). */
  summary: publicProcedure
    .input(z.object({ periodStart: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const today = todayIso()

      const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
      const startDay = householdRow?.budgetPeriodStartDay ?? 1
      const jointBasis = (householdRow?.jointContributionBasis ?? 'equal') as
        | 'equal'
        | 'income_proportional'
        | 'custom'
      const period = periodForDate(input?.periodStart ?? today, startDay)

      const members = await ctx.db.select().from(member).where(isNull(member.archivedAt))
      const pots = await ctx.db.select().from(pot).where(isNull(pot.archivedAt))
      const categories = await ctx.db.select().from(category).where(isNull(category.archivedAt))
      const expenses = await ctx.db
        .select()
        .from(expense)
        .where(and(isNull(expense.archivedAt), eq(expense.active, 1)))

      const sharesByExpense = new Map<string, Array<{ ownerId: string; amount: number; potId: string | null }>>()
      for (const e of expenses) {
        const shares = await ctx.db.select().from(expenseShare).where(eq(expenseShare.expenseId, e.id))
        sharesByExpense.set(
          e.id,
          shares.map((s) => ({ ownerId: s.ownerId, amount: s.amount, potId: s.potId })),
        )
      }

      const incomeByMember = await computeIncomeByMember(ctx.db)

      // B / C — funding plan (per-person set-aside, remainder, income share).
      const funding = computeFundingPlan({
        pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
        expenses: expenses.map((e) => ({
          recurrence: e.recurrence as Recurrence,
          active: true,
          shares: sharesByExpense.get(e.id) ?? [],
        })),
        members: members.map((m) => ({
          id: m.id,
          kind: m.kind as 'person' | 'joint',
          displayName: m.displayName,
          jointContributionWeight: m.jointContributionWeight,
          monthlyIncome: incomeByMember.get(m.id)?.monthlyIncome ?? 0,
        })),
        jointContributionBasis: jointBasis,
      })

      // A — catch-up backlog (all-time un-reconciled).
      const unreconciled = await ctx.db
        .select()
        .from(spendTransaction)
        .where(eq(spendTransaction.reconciled, 0))
      const backlog = computeBacklog({
        transactions: unreconciled.map((t) => ({
          potId: t.potId,
          amount: t.amount,
          reconciled: false,
          ownerId: t.ownerId,
        })),
        pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
      })

      // D — allocation by category (planned funding).
      const potCategoryById = new Map(pots.map((p) => [p.id, p.categoryId]))
      const allocation = allocationByCategory({
        pots: funding.pots.map((p) => ({
          id: p.potId,
          categoryId: potCategoryById.get(p.potId) ?? null,
          fundingPerMonth: p.fundingPerMonth,
        })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      })

      // E — 12-month household net trend.
      const payslipSummaries = await loadPayslipSummaries(ctx.db)
      const incomeTrend = monthlyNetTrend(
        payslipSummaries.map((p) => ({ payDate: p.payDate, effectiveNet: p.effectiveNet })),
        today,
        12,
      )

      // F — recent activity (last 10 spends, with names for inline display).
      const memberName = new Map(members.map((m) => [m.id, m.displayName]))
      const potName = new Map(pots.map((p) => [p.id, p.name]))
      const recentRows = await ctx.db
        .select()
        .from(spendTransaction)
        .orderBy(desc(spendTransaction.date), desc(spendTransaction.createdAt))
        .limit(10)
      const recentActivity = recentRows.map((r) => ({
        id: r.id,
        date: r.date,
        description: r.description,
        amount: r.amount,
        ownerId: r.ownerId,
        ownerName: memberName.get(r.ownerId) ?? 'Unknown',
        potId: r.potId,
        potName: r.potId ? potName.get(r.potId) ?? 'Unknown' : null,
        reconciled: r.reconciled === 1,
      }))

      // G — upcoming payments over the next 30 days.
      const upcomingExpenses: UpcomingExpenseInput[] = expenses.map((e) => ({
        id: e.id,
        name: e.name,
        recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
        dueAnchor: e.dueAnchor,
        amount: (sharesByExpense.get(e.id) ?? []).reduce((acc, s) => acc + s.amount, 0),
        reminderDays: e.dueReminderDays,
      }))
      const upcoming = projectUpcoming({ expenses: upcomingExpenses, from: today, to: addDays(today, UPCOMING_HORIZON_DAYS) })

      const householdMonthlyIncome = [...incomeByMember.values()].reduce((acc, i) => acc + i.monthlyIncome, 0)
      const coupleSurplus = funding.perPerson.reduce((acc, p) => acc + p.remainder, 0)

      return {
        period,
        backlog,
        funding,
        allocation,
        incomeTrend,
        recentActivity,
        upcoming,
        householdMonthlyIncome,
        coupleSurplus,
      }
    }),
})
