/** Projects recurring outgoings into concrete cash-out dates over a horizon
 *  (spec §5.1 / §6.6). Pure: dates are `YYYY-MM-DD`, amounts integer minor units. */
import { addMonths } from '../../shared/dates'

type ExpenseRecurrence = 'monthly' | 'quarterly' | 'yearly'

const INTERVAL_MONTHS: Record<ExpenseRecurrence, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

export interface UpcomingExpenseInput {
  id: string
  name: string
  recurrence: ExpenseRecurrence
  dueAnchor: string | null
  /** Total per-recurrence cash-out (sum of the expense's shares). */
  amount: number
}

export interface UpcomingPayment {
  expenseId: string
  name: string
  date: string
  amount: number
  daysUntil: number
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

/** Every occurrence of `anchor` (recomputed from the anchor each step to avoid
 *  month-length drift) that falls within [from, to] inclusive. */
function occurrencesInRange(anchor: string, intervalMonths: number, from: string, to: string): string[] {
  const at = (n: number) => addMonths(anchor, n * intervalMonths)
  let n = 0
  while (at(n) > from) n -= 1
  while (at(n) < from) n += 1
  const result: string[] = []
  for (let occ = at(n); occ <= to; n += 1, occ = at(n)) {
    result.push(occ)
  }
  return result
}

export function projectUpcoming(input: {
  expenses: UpcomingExpenseInput[]
  from: string
  to: string
}): UpcomingPayment[] {
  const { expenses, from, to } = input
  const payments: UpcomingPayment[] = []

  for (const e of expenses) {
    if (!e.dueAnchor) continue
    const interval = INTERVAL_MONTHS[e.recurrence]
    for (const date of occurrencesInRange(e.dueAnchor, interval, from, to)) {
      payments.push({
        expenseId: e.id,
        name: e.name,
        date,
        amount: e.amount,
        daysUntil: daysBetween(from, date),
      })
    }
  }

  payments.sort((a, b) => a.date.localeCompare(b.date))
  return payments
}
