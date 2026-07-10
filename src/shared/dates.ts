/** Calendar-date helpers. Dates are `YYYY-MM-DD` text — a day, not a moment —
 *  so they compare lexicographically and carry no timezone. */

/** Today as `YYYY-MM-DD`, in the server's local timezone. Consumers treat this
 *  as the household's calendar day (period selection, `daysUntil`, trend
 *  buckets), so it must NOT be the UTC day — for a UTC+ household near local
 *  midnight the UTC slice is still yesterday, showing the wrong period. Build it
 *  from local date parts rather than `toISOString()` (which is always UTC). */
export function todayIso(): string {
  const now = new Date()
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`
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
