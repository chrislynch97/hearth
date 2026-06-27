export type Recurrence =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'weekly'
  | 'fortnightly'
  | 'one_off'

/** Returns the monthly-equivalent of an amount (minor units), unrounded for precise summation. */
export function normaliseToMonthly(amountMinor: number, recurrence: Recurrence): number {
  switch (recurrence) {
    case 'monthly':
      return amountMinor
    case 'quarterly':
      return amountMinor / 3
    case 'yearly':
      return amountMinor / 12
    case 'weekly':
      return (amountMinor * 52) / 12
    case 'fortnightly':
      return (amountMinor * 26) / 12
    case 'one_off':
      return 0
  }
}

/** Round half-up to the nearest integer minor unit. */
export function roundMinor(value: number): number {
  return Math.round(value + Number.EPSILON)
}

/** Sum monthly-equivalents at full precision, rounding once at the end. */
export function fundingPerMonth(
  shares: { amount: number; recurrence: Recurrence }[],
): number {
  const sum = shares.reduce((acc, s) => acc + normaliseToMonthly(s.amount, s.recurrence), 0)
  return roundMinor(sum)
}
