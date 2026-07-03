/** Pure raise/salary-history logic (spec §6.4). Raise rows *are* the salary
 *  history; each function takes one owner's raises. Salaries are annual, in
 *  integer minor units. Dates are `YYYY-MM-DD` and compare lexicographically. */

export interface RaiseInput {
  id: string
  effectiveDate: string
  newSalary: number
}

/** Newest-first by effective date. */
function sortedDesc(raises: RaiseInput[]): RaiseInput[] {
  return [...raises].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
}

/** The salary in force immediately before the given raise (the latest earlier raise),
 *  or null if it's the baseline. */
export function prevSalary(raises: RaiseInput[], raiseId: string): number | null {
  const target = raises.find((r) => r.id === raiseId)
  if (!target) return null
  const earlier = sortedDesc(raises).find((r) => r.effectiveDate < target.effectiveDate)
  return earlier ? earlier.newSalary : null
}

/** Percentage increase vs the previous raise, or null when there's no prior
 *  salary or it was zero (guards a zero denominator → "—" in the UI). */
export function percentIncrease(raises: RaiseInput[], raiseId: string): number | null {
  const target = raises.find((r) => r.id === raiseId)
  if (!target) return null
  const prev = prevSalary(raises, raiseId)
  if (prev === null || prev === 0) return null
  return ((target.newSalary - prev) / prev) * 100
}

/** The salary in force as of a given date — the latest raise effective on or
 *  before `asOf` — or null if none is yet effective. */
export function currentSalary(raises: RaiseInput[], asOf: string): number | null {
  const effective = sortedDesc(raises).find((r) => r.effectiveDate <= asOf)
  return effective ? effective.newSalary : null
}
