/** Calendar-date helpers. Dates are `YYYY-MM-DD` text — a day, not a moment —
 *  so they compare lexicographically and carry no timezone. */

/** Today as `YYYY-MM-DD`. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Subtract a number of whole months from a `YYYY-MM-DD` date, clamping the day
 *  to the last valid day of the target month (e.g. 31 May − 3mo → 28/29 Feb). */
export function subtractMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  // Work in a zero-based absolute month index, then peel back to year/month.
  const monthIndex = y * 12 + (m - 1) - months
  const targetYear = Math.floor(monthIndex / 12)
  const targetMonth = monthIndex - targetYear * 12 // 0-11
  const lastDay = daysInMonth(targetYear, targetMonth)
  const day = Math.min(d, lastDay)
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(day, 2)}`
}

/** Add a number of whole months (negative to subtract), clamping the day to the
 *  last valid day of the target month. */
export function addMonths(iso: string, months: number): string {
  return subtractMonths(iso, -months)
}

/** Add a number of days (negative to subtract) to a `YYYY-MM-DD` date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`
}

function daysInMonth(year: number, monthZeroBased: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}
