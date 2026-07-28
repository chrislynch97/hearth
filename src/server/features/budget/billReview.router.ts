import { eq, isNull, isNotNull } from 'drizzle-orm'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { expense, billPrice, spendTransaction } from '../../db/schema'
import { todayIso } from '../../../shared/dates'
import type { Recurrence } from '../../../shared/recurrence'
import { computeBillReview, type BillReviewBillInput } from './billReview'

export const billReviewRouter = router({
  // Active bills ranked by 12-month change with creep detection (issue #70).
  // Reads both price sources — actual payments (spend_transaction.expenseId) and
  // stated history (bill_price) — and lets the compute prefer actuals per bill.
  // Returned unsorted; the page ranks by the metric the user picks.
  review: publicProcedure.query(async ({ ctx }) => {
    const bills = await ctx.db
      .select({ id: expense.id, name: expense.name, recurrence: expense.recurrence, amount: expense.amount })
      .from(expense)
      .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

    const prices = await ctx.db
      .select({ expenseId: billPrice.expenseId, effectiveDate: billPrice.effectiveDate, amount: billPrice.amount })
      .from(billPrice)
      .where(scopeWhere(ctx.householdId, billPrice.householdId))

    const payments = await ctx.db
      .select({ expenseId: spendTransaction.expenseId, date: spendTransaction.date, amount: spendTransaction.amount })
      .from(spendTransaction)
      .where(scopeWhere(ctx.householdId, spendTransaction.householdId, isNotNull(spendTransaction.expenseId)))

    const pricesByBill = new Map<string, { effectiveDate: string; amount: number }[]>()
    for (const p of prices) {
      const list = pricesByBill.get(p.expenseId) ?? []
      list.push({ effectiveDate: p.effectiveDate, amount: p.amount })
      pricesByBill.set(p.expenseId, list)
    }

    const actualsByBill = new Map<string, { date: string; amount: number }[]>()
    for (const p of payments) {
      if (!p.expenseId) continue
      const list = actualsByBill.get(p.expenseId) ?? []
      list.push({ date: p.date, amount: p.amount })
      actualsByBill.set(p.expenseId, list)
    }

    const input: BillReviewBillInput[] = bills.map((b) => ({
      id: b.id,
      name: b.name,
      recurrence: b.recurrence as Recurrence,
      currentAmount: b.amount ?? 0,
      actuals: actualsByBill.get(b.id) ?? [],
      priceHistory: pricesByBill.get(b.id) ?? [],
    }))

    return computeBillReview(input, todayIso())
  }),
})
