import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { category, expense, setAside, household, member, pot, spendTransaction } from '../db/schema'
import { computeBacklog } from '../spending/backlog'
import { computeFundingPlan } from '../features/budget/funding'
import { computeIncomeByMember, loadPayslipSummaries } from '../features/income/service'
import { allocationByCategory, monthlyNetTrend } from '../dashboard/summary'
import { projectUpcoming, type UpcomingExpenseInput } from '../features/budget/upcoming'
import { periodForDate, periodConfig } from '../../shared/period'
import { addDays, todayIso } from '../../shared/dates'
import { monthlyToPeriod, roundMinor, type Recurrence } from '../../shared/recurrence'

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
      const jointFundingModel = (householdRow?.jointFundingModel ?? 'split') as 'split' | 'pooled'
      const cfg = periodConfig(householdRow ?? 1)
      const period = periodForDate(input?.periodStart ?? today, cfg)

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
        jointFundingModel,
        frequency: cfg.frequency,
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
            fundingPerPeriod: p.fundingPerPeriod,
          })),
          // Bills paid straight from the main account (funding='main') are part of
          // the plan too — without them these categories read as planned £0.
          ...funding.mainAccountByCategory.map((m, i) => ({
            id: `main:${i}`,
            categoryId: m.categoryId,
            fundingPerPeriod: m.fundingPerPeriod,
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

      // Re-base household income onto the budget period so it lines up with the
      // per-period allocation and surplus figures below.
      const householdMonthly = [...incomeByMember.values()].reduce((acc, i) => acc + i.monthlyIncome, 0)
      const householdPeriodIncome = roundMinor(monthlyToPeriod(householdMonthly, cfg.frequency))
      // Model-agnostic; in 'pooled' mode per-person remainders are 0, so the
      // surplus lives on the plan instead of summing remainders here.
      const coupleSurplus = funding.coupleSurplus

      return {
        period,
        backlog,
        funding,
        allocation,
        incomeTrend,
        recentActivity,
        upcoming,
        householdPeriodIncome,
        coupleSurplus,
      }
    }),
})
