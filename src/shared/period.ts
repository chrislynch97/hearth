/** Budget-period maths. A period starts on `Household.budget_period_start_day`
 *  (1–28) and runs until the day before the next start. Dates are `YYYY-MM-DD`. */
import { addDays, addMonths } from './dates'

export interface Period {
  start: string // inclusive, YYYY-MM-DD
  end: string // inclusive, YYYY-MM-DD
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Build a period from the month/year its start falls in. */
function periodFromStart(year: number, monthOneBased: number, startDay: number): Period {
  const start = `${pad(year, 4)}-${pad(monthOneBased, 2)}-${pad(startDay, 2)}`
  const nextStart = addMonths(start, 1)
  return { start, end: addDays(nextStart, -1) }
}

/** The budget period containing `iso`, given the household start day. */
export function periodForDate(iso: string, startDay: number): Period {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  let year = y
  let month = m
  if (d < startDay) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
  }
  return periodFromStart(year, month, startDay)
}

/** Move a period forward (`delta > 0`) or back by whole periods (months). */
export function shiftPeriod(period: Period, delta: number, startDay: number): Period {
  const shiftedStart = addMonths(period.start, delta)
  const [y, m] = shiftedStart.split('-').map(Number) as [number, number]
  return periodFromStart(y, m, startDay)
}
