import type { PeriodFrequency } from './period'

export type Recurrence =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'weekly'
  | 'fortnightly'
  | 'one_off'

/** How many times a recurrence lands per year. `one_off` recurs zero times.
 *  weekly/fortnightly use the conventional 52/26-week year, not calendar-exact. */
const RECURRENCE_PER_YEAR: Record<Recurrence, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  weekly: 52,
  fortnightly: 26,
  one_off: 0,
}

/** How many budget periods of each frequency there are per year — the divisor
 *  that turns an annual amount into a per-period one. Four-weekly gives 13
 *  periods (52 ÷ 4), not 12: a 4-week cycle isn't a calendar month. */
const PERIODS_PER_YEAR: Record<PeriodFrequency, number> = {
  monthly: 12,
  four_weekly: 13,
  fortnightly: 26,
  weekly: 52,
}

/** The per-budget-period equivalent of a recurring amount (minor units), for a
 *  household running budget periods of `frequency`. Unrounded for precise
 *  summation. Computed as annual amount ÷ periods-per-year, so a 'monthly'
 *  frequency reduces exactly to {@link normaliseToMonthly}.
 *  Note: the week-based factors are conventional approximations, not
 *  calendar-exact. */
export function normaliseToPeriod(
  amountMinor: number,
  recurrence: Recurrence,
  frequency: PeriodFrequency,
): number {
  return (amountMinor * RECURRENCE_PER_YEAR[recurrence]) / PERIODS_PER_YEAR[frequency]
}

/** Returns the monthly-equivalent of an amount (minor units), unrounded for precise summation.
 *  Note: weekly/fortnightly use 52/26 weeks ÷ 12 — a conventional approximation, not calendar-exact.
 */
export function normaliseToMonthly(amountMinor: number, recurrence: Recurrence): number {
  return normaliseToPeriod(amountMinor, recurrence, 'monthly')
}

/** Re-base an already monthly-equivalent amount onto a household's budget-period
 *  basis. Used for figures that are inherently monthly (e.g. salaried income)
 *  and so can't be normalised from a recurrence. A 'monthly' frequency is a
 *  no-op. */
export function monthlyToPeriod(monthlyMinor: number, frequency: PeriodFrequency): number {
  return (monthlyMinor * PERIODS_PER_YEAR.monthly) / PERIODS_PER_YEAR[frequency]
}

/** Round half away from zero to the nearest integer minor unit. */
export function roundMinor(value: number): number {
  const result = Math.sign(value) * Math.round(Math.abs(value))
  // Normalise -0 to 0.
  return result === 0 ? 0 : result
}

/** Sum monthly-equivalents at full precision, rounding once at the end. */
export function fundingPerMonth(
  shares: { amount: number; recurrence: Recurrence }[],
): number {
  const sum = shares.reduce((acc, s) => acc + normaliseToMonthly(s.amount, s.recurrence), 0)
  return roundMinor(sum)
}
