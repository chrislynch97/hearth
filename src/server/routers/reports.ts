import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { category, expense, expenseShare, household, member, pot, spendTransaction } from '../db/schema'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember } from '../income/service'
import { allocationByCategory } from '../dashboard/summary'
import { categoryBreakdown, monthOverMonth, perMemberVsJoint, spendVsAllocation } from '../reports/reports'
import { periodForDate } from '../../shared/period'
import { todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

const HOUSEHOLD_ID = 'household'

export const reportsRouter = router({
  /** All reports for a period (spec §5.6), with an optional owner filter on
   *  spend-based reports and a configurable month-over-month window. */
  overview: publicProcedure
    .input(
      z
        .object({
          periodStart: z.string().optional(),
          ownerId: z.string().optional(),
          months: z.number().int().min(1).max(24).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const today = todayIso()
      const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
      const startDay = householdRow?.budgetPeriodStartDay ?? 1
      const jointBasis = (householdRow?.jointContributionBasis ?? 'equal') as
        | 'equal'
        | 'income_proportional'
        | 'custom'
      const period = periodForDate(input?.periodStart ?? today, startDay)
      const months = input?.months ?? 6

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
      const householdMonthlyIncome = [...incomeByMember.values()].reduce((acc, i) => acc + i.monthlyIncome, 0)

      // Planned funding per category (reuse the funding + allocation pipeline).
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
      const potCategory = new Map(pots.map((p) => [p.id, p.categoryId]))
      const allocation = allocationByCategory({
        pots: funding.pots.map((p) => ({
          id: p.potId,
          categoryId: potCategory.get(p.potId) ?? null,
          fundingPerMonth: p.fundingPerMonth,
        })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      })

      // Spends, optionally filtered to one owner.
      const allSpends = await ctx.db.select().from(spendTransaction)
      const scoped = input?.ownerId ? allSpends.filter((s) => s.ownerId === input.ownerId) : allSpends
      const inPeriod = scoped.filter((s) => s.date >= period.start && s.date <= period.end)

      const categoryRefs = categories.map((c) => ({ id: c.id, name: c.name }))
      const breakdown = categoryBreakdown({
        spends: inPeriod.map((s) => ({ potId: s.potId, categoryId: s.categoryId, amount: s.amount })),
        potCategory,
        categories: categoryRefs,
      })

      return {
        period,
        householdMonthlyIncome,
        spendVsAllocation: spendVsAllocation({ allocation: allocation.perCategory, breakdown: breakdown.rows }),
        categoryBreakdown: breakdown,
        perMemberVsJoint: perMemberVsJoint({
          members: members.map((m) => ({ id: m.id, displayName: m.displayName, kind: m.kind as 'person' | 'joint' })),
          expenses: expenses.map((e) => ({
            recurrence: e.recurrence as Recurrence,
            shares: sharesByExpense.get(e.id) ?? [],
          })),
        }),
        monthOverMonth: monthOverMonth({
          spends: scoped.map((s) => ({ date: s.date, potId: s.potId, categoryId: s.categoryId, amount: s.amount })),
          potCategory,
          categories: categoryRefs,
          asOf: today,
          months,
        }),
      }
    }),
})
