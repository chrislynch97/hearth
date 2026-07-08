import { z } from 'zod'
import { eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { category, expense, setAside, household, member, pot, spendTransaction } from '../db/schema'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember } from '../income/service'
import { allocationByCategory } from '../dashboard/summary'
import { categoryBreakdown, monthlyTotals, monthOverMonth, perMemberVsJoint, spendVsAllocation } from '../reports/reports'
import { periodForDate } from '../../shared/period'
import { todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

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
      const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
      const startDay = householdRow?.budgetPeriodStartDay ?? 1
      const jointBasis = (householdRow?.jointContributionBasis ?? 'equal') as
        | 'equal'
        | 'income_proportional'
        | 'custom'
      const period = periodForDate(input?.periodStart ?? today, startDay)
      const months = input?.months ?? 6

      const members = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, isNull(member.archivedAt)))
      const pots = await ctx.db
        .select()
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))
      const categories = await ctx.db
        .select()
        .from(category)
        .where(scopeWhere(ctx.householdId, category.householdId, isNull(category.archivedAt)))
      const expenses = await ctx.db
        .select()
        .from(expense)
        .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

      const setAsides = await ctx.db
        .select()
        .from(setAside)
        .where(scopeWhere(ctx.householdId, setAside.householdId, isNull(setAside.archivedAt), eq(setAside.active, 1)))

      const incomeByMember = await computeIncomeByMember(ctx.db, ctx.householdId)
      const householdMonthlyIncome = [...incomeByMember.values()].reduce((acc, i) => acc + i.monthlyIncome, 0)

      const billInputs = expenses.map((e) => ({
        recurrence: e.recurrence as Recurrence,
        active: true,
        funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
        potId: e.potId,
        categoryId: e.categoryId,
        amount: e.amount ?? 0,
      }))
      const setAsideInputs = setAsides.map((s) => ({
        recurrence: s.recurrence as Recurrence,
        active: true,
        potId: s.potId,
        amount: s.amount,
      }))

      // Planned funding per category (reuse the funding + allocation pipeline).
      const funding = computeFundingPlan({
        pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
        bills: billInputs,
        setAsides: setAsideInputs,
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
      const allSpends = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId))
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
          costs: (() => {
            const potOwner = new Map(pots.map((p) => [p.id, p.ownerId]))
            const jointId = members.find((m) => m.kind === 'joint')?.id
            const costs: Array<{ recurrence: Recurrence; amount: number; ownerId: string }> = []
            for (const b of billInputs) {
              // Attribute a bill to whoever owns the pot it drains; main-account bills to joint.
              const ownerId = b.funding === 'main' ? jointId : b.potId ? potOwner.get(b.potId) : undefined
              if (ownerId) costs.push({ recurrence: b.recurrence, amount: b.amount, ownerId })
            }
            for (const s of setAsides) costs.push({ recurrence: s.recurrence as Recurrence, amount: s.amount, ownerId: s.ownerId })
            return costs
          })(),
        }),
        monthlyTotals: monthlyTotals({
          spends: scoped.map((s) => ({ date: s.date, amount: s.amount })),
          asOf: today,
          months,
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
