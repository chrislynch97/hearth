/** What a pot should hold on a given day (issue hearth-planning#38): for each bill
 *  it pays, the share of the next payment that should have been put by since the
 *  last one. Money is assumed to land once per budget period, on its start day,
 *  so the figure steps up each payday rather than creeping daily. Pure: dates
 *  are `YYYY-MM-DD`, amounts integer minor units. */
import { periodForDate, shiftPeriod, type PeriodConfig } from "@shared/period"
import { roundMinor } from "@shared/recurrence"
import { INTERVAL_MONTHS, occurrenceAround } from './upcoming'

type BillRecurrence = keyof typeof INTERVAL_MONTHS

export interface PotBalanceBillInput {
  id: string
  name: string
  potId: string | null
  funding: 'pot_manual' | 'pot_auto' | 'main'
  recurrence: BillRecurrence
  dueAnchor: string | null
  /** Current per-recurrence price; the fallback when there's no history. */
  amount: number
  active: boolean
}

export interface PotBalancePriceInput {
  expenseId: string
  effectiveDate: string
  amount: number
  createdAt: Date
}

export interface PotBalanceLine {
  expenseId: string
  name: string
  recurrence: BillRecurrence
  /** Price in force on the day. */
  amount: number
  /** Null when the bill has no due date, so can't be placed in its cycle. */
  lastDue: string | null
  nextDue: string | null
  accrued: number
}

export interface PotBalance {
  potId: string
  total: number
  lines: PotBalanceLine[]
}

/** Budget-period starts in (after, upTo]. */
function paydaysBetween(after: string, upTo: string, period: PeriodConfig): number {
  let count = 0
  for (let p = shiftPeriod(periodForDate(after, period), 1, period); p.start <= upTo; p = shiftPeriod(p, 1, period)) {
    count += 1
  }
  return count
}

/** The latest price effective on or before `on`. History that only starts later
 *  falls back to its first row, the bill's starting price. */
function priceOn(bill: PotBalanceBillInput, history: PotBalancePriceInput[], on: string): number {
  const rows = history
    .filter((row) => row.expenseId === bill.id)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.getTime() - b.createdAt.getTime())
  if (rows.length === 0) return bill.amount
  const inForce = rows.filter((row) => row.effectiveDate <= on)
  return (inForce[inForce.length - 1] ?? rows[0]!).amount
}

export function expectedPotBalances(input: {
  potIds: string[]
  bills: PotBalanceBillInput[]
  priceHistory: PotBalancePriceInput[]
  on: string
  period: PeriodConfig
}): PotBalance[] {
  const { potIds, bills, priceHistory, on, period } = input

  return potIds.map((potId) => {
    const lines = bills
      .filter((bill) => bill.active && bill.funding !== 'main' && bill.potId === potId)
      .map((bill): PotBalanceLine => {
        const amount = priceOn(bill, priceHistory, on)
        const base = { expenseId: bill.id, name: bill.name, recurrence: bill.recurrence, amount }
        if (!bill.dueAnchor) return { ...base, lastDue: null, nextDue: null, accrued: 0 }

        const { last, next } = occurrenceAround(bill.dueAnchor, INTERVAL_MONTHS[bill.recurrence], on)
        const cycle = paydaysBetween(last, next, period)
        const accrued = cycle === 0 ? 0 : roundMinor((amount * paydaysBetween(last, on, period)) / cycle)
        return { ...base, lastDue: last, nextDue: next, accrued }
      })

    return { potId, total: lines.reduce((sum, line) => sum + line.accrued, 0), lines }
  })
}
