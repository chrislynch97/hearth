import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { category, expense, setAside, household, member, pot, spendTransaction } from '../db/schema'
import { computeBacklog } from '../spending/backlog'
import { computeFundingPlan } from '../plan/funding'
import { computeIncomeByMember, loadPayslipSummaries } from '../income/service'
import { allocationByCategory, monthlyNetTrend } from '../dashboard/summary'
import { projectUpcoming, type UpcomingExpenseInput } from '../plan/upcoming'
import { periodForDate, periodConfig } from '../../shared/period'
import { addDays, todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'

const UPCOMING_HORIZON_DAYS = 30

export const dashboardRouter = router({
  /** One aggregated call powering the home dashboard (spec §5.6). */
  summary: publicProcedure
    .input(z.object({ periodStart: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const today = todayIso()

      // These reads are all independent, so fire them together rather than
      // awaiting one after another (they later feed the funding plan, backlog,
      // trend and recent-activity sections).
      const [
        householdRows,
        members,
        pots,
        categories,
        expenses,
        setAsides,
        incomeByMember,
        unreconciled,
        recentRows,
        payslipSummaries,
      ] = await Promise.all([
        ctx.db.select().from(household).where(eq(household.id, ctx.householdId)),
        ctx.db.select().from(member).where(scopeWhere(ctx.householdId, member.householdId, isNull(member.archivedAt))),
        ctx.db.select().from(pot).where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt))),
        ctx.db
          .select()
          .from(category)
          .where(scopeWhere(ctx.householdId, category.householdId, isNull(category.archivedAt))),
        ctx.db
          .select()
          .from(expense)
          .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1))),
        ctx.db
          .select()
          .from(setAside)
          .where(scopeWhere(ctx.householdId, setAside.householdId, isNull(setAside.archivedAt), eq(setAside.active, 1))),
        computeIncomeByMember(ctx.db, ctx.householdId),
        ctx.db
          .select()
          .from(spendTransaction)
          .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.reconciled, 0))),
        ctx.db
          .select()
          .from(spendTransaction)
          .where(scopeWhere(ctx.householdId, spendTransaction.householdId))
          .orderBy(desc(spendTransaction.date), desc(spendTransaction.createdAt))
          .limit(10),
        loadPayslipSummaries(ctx.db, ctx.householdId),
      ])

      const householdRow = householdRows[0]
      const jointBasis = (householdRow?.jointContributionBasis ?? 'equal') as
        | 'equal'
        | 'income_proportional'
        | 'custom'
      const period = periodForDate(input?.periodStart ?? today, periodConfig(householdRow ?? 1))

      // B / C — funding plan (per-person set-aside, remainder, income share).
      const funding = computeFundingPlan({
        pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
        bills: expenses.map((e) => ({
          recurrence: e.recurrence as Recurrence,
          active: true,
          funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
          potId: e.potId,
          categoryId: e.categoryId,
          amount: e.amount ?? 0,
        })),
        setAsides: setAsides.map((s) => ({
          recurrence: s.recurrence as Recurrence,
          active: true,
          potId: s.potId,
          amount: s.amount,
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
      const backlog = computeBacklog({
        transactions: unreconciled.map((t) => ({
          id: t.id,
          date: t.date,
          description: t.description,
          potId: t.potId,
          amount: t.amount,
          reconciled: false,
          settledAtSource: t.settledAtSource === 1,
          ownerId: t.ownerId,
        })),
        pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
      })

      // D — allocation by category (planned funding).
      const potCategoryById = new Map(pots.map((p) => [p.id, p.categoryId]))
      const allocation = allocationByCategory({
        pots: [
          ...funding.pots.map((p) => ({
            id: p.potId,
            categoryId: potCategoryById.get(p.potId) ?? null,
            fundingPerMonth: p.fundingPerMonth,
          })),
          // Bills paid straight from the main account (funding='main') are part of
          // the plan too — without them these categories read as planned £0.
          ...funding.mainAccountByCategory.map((m, i) => ({
            id: `main:${i}`,
            categoryId: m.categoryId,
            fundingPerMonth: m.fundingPerMonth,
          })),
        ],
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      })

      // E — 12-month household net trend.
      const incomeTrend = monthlyNetTrend(
        payslipSummaries.map((p) => ({ payDate: p.payDate, effectiveNet: p.effectiveNet })),
        today,
        12,
      )

      // F — recent activity (last 10 spends, with names for inline display).
      const memberName = new Map(members.map((m) => [m.id, m.displayName]))
      const potName = new Map(pots.map((p) => [p.id, p.name]))
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
        amount: e.amount ?? 0,
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
