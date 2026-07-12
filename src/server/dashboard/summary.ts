/** Pure dashboard aggregations (spec §5.6 D & E). Amounts are integer minor units. */
import { subtractMonths } from '../../shared/dates'

export interface CategoryAllocation {
  categoryId: string | null
  name: string
  funding: number
}

/** Planned funding grouped by category (null = Uncategorised), zero-funding pots
 *  omitted, sorted by funding descending. Amounts are per budget period. */
export function allocationByCategory(input: {
  pots: Array<{ id: string; categoryId: string | null; fundingPerPeriod: number }>
  categories: Array<{ id: string; name: string }>
}): { perCategory: CategoryAllocation[]; total: number } {
  const nameById = new Map(input.categories.map((c) => [c.id, c.name]))
  const byCategory = new Map<string | null, number>()
  let total = 0

  for (const p of input.pots) {
    if (p.fundingPerPeriod === 0) continue
    byCategory.set(p.categoryId, (byCategory.get(p.categoryId) ?? 0) + p.fundingPerPeriod)
    total += p.fundingPerPeriod
  }

  const perCategory: CategoryAllocation[] = [...byCategory.entries()]
    .map(([categoryId, funding]) => ({
      categoryId,
      name: categoryId === null ? 'Uncategorised' : nameById.get(categoryId) ?? 'Unknown',
      funding,
    }))
    .sort((a, b) => b.funding - a.funding)

  return { perCategory, total }
}

export interface MonthNet {
  month: string // YYYY-MM
  net: number
}

/** Household net pay summed per calendar month over the trailing `months`
 *  months ending at `asOf` (inclusive of asOf's month), chronological. */
export function monthlyNetTrend(
  payslips: Array<{ payDate: string; effectiveNet: number }>,
  asOf: string,
  months: number,
): MonthNet[] {
  const result: MonthNet[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = subtractMonths(asOf, i).slice(0, 7)
    const net = payslips
      .filter((p) => p.payDate.slice(0, 7) === month)
      .reduce((acc, p) => acc + p.effectiveNet, 0)
    result.push({ month, net })
  }
  return result
}
