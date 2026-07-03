/** Pure report aggregations (spec §5.6 Reports). Amounts are integer minor
 *  units; dates are `YYYY-MM-DD`. Callers pre-filter spends by period. */
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { subtractMonths } from '../../shared/dates'

export interface CategoryRef {
  id: string
  name: string
}

/** The category a spend counts against: its pot's category, else its own. */
export function spendCategory(
  spend: { potId: string | null; categoryId: string | null },
  potCategory: Map<string, string | null>,
): string | null {
  if (spend.potId) return potCategory.get(spend.potId) ?? null
  return spend.categoryId
}

export interface CategorySpendRow {
  categoryId: string | null
  name: string
  spent: number
}

function categoryName(categoryId: string | null, categories: CategoryRef[]): string {
  if (categoryId === null) return 'Uncategorised'
  return categories.find((c) => c.id === categoryId)?.name ?? 'Unknown'
}

/** Actual spend grouped by category, sorted by spend descending. */
export function categoryBreakdown(input: {
  spends: Array<{ potId: string | null; categoryId: string | null; amount: number }>
  potCategory: Map<string, string | null>
  categories: CategoryRef[]
}): { rows: CategorySpendRow[]; total: number } {
  const byCategory = new Map<string | null, number>()
  let total = 0
  for (const s of input.spends) {
    const cat = spendCategory(s, input.potCategory)
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + s.amount)
    total += s.amount
  }
  const rows = [...byCategory.entries()]
    .map(([categoryId, spent]) => ({ categoryId, name: categoryName(categoryId, input.categories), spent }))
    .sort((a, b) => b.spent - a.spent)
  return { rows, total }
}

export interface SpendVsAllocationRow {
  categoryId: string | null
  name: string
  planned: number
  actual: number
  diff: number // planned − actual (positive = under-spent)
}

/** Planned funding vs actual spend per category (union of both sides). */
export function spendVsAllocation(input: {
  allocation: Array<{ categoryId: string | null; name: string; funding: number }>
  breakdown: CategorySpendRow[]
}): SpendVsAllocationRow[] {
  const plannedBy = new Map<string | null, { name: string; planned: number }>()
  for (const a of input.allocation) plannedBy.set(a.categoryId, { name: a.name, planned: a.funding })
  const actualBy = new Map<string | null, { name: string; actual: number }>()
  for (const b of input.breakdown) actualBy.set(b.categoryId, { name: b.name, actual: b.spent })

  const keys = new Set<string | null>([...plannedBy.keys(), ...actualBy.keys()])
  const rows: SpendVsAllocationRow[] = []
  for (const key of keys) {
    const planned = plannedBy.get(key)?.planned ?? 0
    const actual = actualBy.get(key)?.actual ?? 0
    const name = plannedBy.get(key)?.name ?? actualBy.get(key)?.name ?? 'Unknown'
    rows.push({ categoryId: key, name, planned, actual, diff: planned - actual })
  }
  return rows.sort((a, b) => b.planned - a.planned)
}

export interface MemberCostRow {
  ownerId: string
  displayName: string
  kind: 'person' | 'joint'
  monthlyCost: number
}

/** Each owner's monthly-equivalent outgoing cost from their expense shares — the
 *  fairness lens (spec §6.5: ExpenseShare.owner_id drives fairness reporting). */
export function perMemberVsJoint(input: {
  members: Array<{ id: string; displayName: string; kind: 'person' | 'joint' }>
  expenses: Array<{ recurrence: Recurrence; shares: Array<{ ownerId: string; amount: number }> }>
}): MemberCostRow[] {
  const byOwner = new Map<string, number>()
  for (const e of input.expenses) {
    for (const s of e.shares) {
      byOwner.set(s.ownerId, (byOwner.get(s.ownerId) ?? 0) + normaliseToMonthly(s.amount, e.recurrence))
    }
  }
  return input.members.map((m) => ({
    ownerId: m.id,
    displayName: m.displayName,
    kind: m.kind,
    monthlyCost: roundMinor(byOwner.get(m.id) ?? 0),
  }))
}

export interface MonthOverMonth {
  months: string[] // YYYY-MM, chronological
  rows: Array<{ categoryId: string | null; name: string; byMonth: number[] }>
}

/** Category-by-month spend matrix over the trailing `months` months ending at asOf. */
export function monthOverMonth(input: {
  spends: Array<{ date: string; potId: string | null; categoryId: string | null; amount: number }>
  potCategory: Map<string, string | null>
  categories: CategoryRef[]
  asOf: string
  months: number
}): MonthOverMonth {
  const months: string[] = []
  for (let i = input.months - 1; i >= 0; i -= 1) months.push(subtractMonths(input.asOf, i).slice(0, 7))
  const monthIndex = new Map(months.map((m, i) => [m, i]))

  const byCategory = new Map<string | null, number[]>()
  for (const s of input.spends) {
    const month = s.date.slice(0, 7)
    const idx = monthIndex.get(month)
    if (idx === undefined) continue
    const cat = spendCategory(s, input.potCategory)
    const arr = byCategory.get(cat) ?? new Array(months.length).fill(0)
    arr[idx] += s.amount
    byCategory.set(cat, arr)
  }

  const rows = [...byCategory.entries()]
    .map(([categoryId, byMonth]) => ({
      categoryId,
      name: categoryName(categoryId, input.categories),
      byMonth,
    }))
    .sort((a, b) => b.byMonth.reduce((x, y) => x + y, 0) - a.byMonth.reduce((x, y) => x + y, 0))

  return { months, rows }
}
