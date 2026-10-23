import { z } from 'zod'
import { eq, isNull } from 'drizzle-orm'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { billPrice, expense, household, pot } from '../../db/schema'
import { loadFundingPlan } from './fundingLoader'
import { paydayPdfForHousehold } from './paydayPdf'
import { projectUpcoming, type UpcomingExpenseInput } from './upcoming'
import { expectedPotBalances } from './potBalance'
import { addDays, todayIso } from "@shared/dates"
import { periodConfig } from "@shared/period"

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export const planRouter = router({
  funding: publicProcedure.query(async ({ ctx }) => (await loadFundingPlan(ctx.db, ctx.householdId)).plan),

  /** The payday sheet as a PDF (issue #36), base64 so it rides the JSON transport;
   *  the Funding page turns it into a download. */
  paydayPdf: publicProcedure.query(async ({ ctx }) => {
    const { filename, pdf } = await paydayPdfForHousehold(ctx.db, ctx.householdId)
    return { filename, base64: pdf.toString('base64') }
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

  /** What each pot should hold on a day (default today) to cover its bills when
   *  they next fall due, with a per-bill breakdown. */
  potBalances: publicProcedure
    .input(z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional() }).optional())
    .query(async ({ ctx, input }) => {
      const pots = await ctx.db
        .select({ id: pot.id })
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))

      const expenses = await ctx.db
        .select()
        .from(expense)
        .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt)))

      const prices = await ctx.db
        .select()
        .from(billPrice)
        .where(scopeWhere(ctx.householdId, billPrice.householdId))

      const [householdRow] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))

      return expectedPotBalances({
        potIds: pots.map((p) => p.id),
        bills: expenses.map((e) => ({
          id: e.id,
          name: e.name,
          potId: e.potId,
          funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
          recurrence: e.recurrence as 'monthly' | 'quarterly' | 'yearly',
          dueAnchor: e.dueAnchor,
          amount: e.amount ?? 0,
          active: e.active === 1,
        })),
        priceHistory: prices,
        on: input?.on ?? todayIso(),
        period: periodConfig(householdRow ?? 1),
      })
    }),
})
