/** Budget-period maths. A period is either a calendar month anchored on
 *  `Household.budget_period_start_day` (1–28), or a fixed-length weekly cycle
 *  (weekly / fortnightly / four-weekly) stepping from a reference `anchor` date.
 *  Dates are `YYYY-MM-DD`. */
import { addDays, addMonths, diffDays } from './dates'

export type PeriodFrequency = 'monthly' | 'four_weekly' | 'fortnightly' | 'weekly'

export interface Period {
  start: string // inclusive, YYYY-MM-DD
  end: string // inclusive, YYYY-MM-DD
}

/** How a household slices time into budget periods. `startDay` drives the
 *  monthly cycle; `anchor` (a reference start date) drives the weekly ones. */
export interface PeriodConfig {
  frequency: PeriodFrequency
  startDay: number // 1–28, day of month — monthly only
  anchor: string // YYYY-MM-DD reference start — non-monthly only
}

// Weeks per period for the fixed-length cycles.
const PERIOD_WEEKS: Record<Exclude<PeriodFrequency, 'monthly'>, number> = {
  weekly: 1,
  fortnightly: 2,
  four_weekly: 4,
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Normalise raw household fields into a `PeriodConfig`. A non-monthly frequency
 *  needs an anchor date; without one we fall back to monthly so existing
 *  households (anchor unset) behave exactly as they always have. Callers can
 *  also pass a bare start-day number for the plain monthly case. */
export function periodConfig(
  input:
    | number
    | {
        budgetPeriodFrequency?: string | null
        budgetPeriodStartDay?: number | null
        budgetPeriodAnchor?: string | null
      },
): PeriodConfig {
  if (typeof input === 'number') {
    return { frequency: 'monthly', startDay: input, anchor: '' }
  }
  const startDay = input.budgetPeriodStartDay ?? 1
  const frequency = input.budgetPeriodFrequency
  const anchor = input.budgetPeriodAnchor ?? ''
  if (frequency && frequency !== 'monthly' && anchor) {
    return { frequency: frequency as PeriodFrequency, startDay, anchor }
  }
  return { frequency: 'monthly', startDay, anchor: '' }
}

/** Accept either a full config or a bare start-day (monthly). */
function resolveConfig(config: PeriodConfig | number): PeriodConfig {
  return typeof config === 'number' ? periodConfig(config) : config
}

// ---- Monthly ------------------------------------------------------------

/** Build a monthly period from the month/year its start falls in. */
function monthlyPeriodFromStart(year: number, monthOneBased: number, startDay: number): Period {
  const start = `${pad(year, 4)}-${pad(monthOneBased, 2)}-${pad(startDay, 2)}`
  const nextStart = addMonths(start, 1)
  return { start, end: addDays(nextStart, -1) }
}

function monthlyPeriodForDate(iso: string, startDay: number): Period {
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
  return monthlyPeriodFromStart(year, month, startDay)
}

// ---- Fixed-length weekly cycles -----------------------------------------

function weeklyPeriodForDate(iso: string, config: PeriodConfig): Period {
  const len = PERIOD_WEEKS[config.frequency as Exclude<PeriodFrequency, 'monthly'>] * 7
  // Which whole period, counting from the anchor, contains `iso`? `floor` keeps
  // dates before the anchor in the correct (negative) period too.
  const n = Math.floor(diffDays(config.anchor, iso) / len)
  const start = addDays(config.anchor, n * len)
  return { start, end: addDays(start, len - 1) }
}

// ---- Public API ---------------------------------------------------------

/** The budget period containing `iso`, for the given household config. Pass a
 *  bare number for the plain monthly (start-day only) case. */
export function periodForDate(iso: string, config: PeriodConfig | number): Period {
  const cfg = resolveConfig(config)
  return cfg.frequency === 'monthly'
    ? monthlyPeriodForDate(iso, cfg.startDay)
    : weeklyPeriodForDate(iso, cfg)
}

// ---- Display helpers ----------------------------------------------------

/** Short per-period suffix for money figures, e.g. `£120/mo`, `£120/4 wks`. */
export function periodUnitLabel(frequency: PeriodFrequency): string {
  switch (frequency) {
    case 'monthly':
      return '/mo'
    case 'four_weekly':
      return '/4 wks'
    case 'fortnightly':
      return '/2 wks'
    case 'weekly':
      return '/wk'
  }
}

/** Adverbial phrase for prose, e.g. "set aside this much each month" /
 *  "every 4 weeks". */
export function periodAdverb(frequency: PeriodFrequency): string {
  switch (frequency) {
    case 'monthly':
      return 'each month'
    case 'four_weekly':
      return 'every 4 weeks'
    case 'fortnightly':
      return 'every 2 weeks'
    case 'weekly':
      return 'each week'
  }
}

/** Move a period forward (`delta > 0`) or back by whole periods. */
export function shiftPeriod(period: Period, delta: number, config: PeriodConfig | number): Period {
  const cfg = resolveConfig(config)
  if (cfg.frequency === 'monthly') {
    const shiftedStart = addMonths(period.start, delta)
    const [y, m] = shiftedStart.split('-').map(Number) as [number, number]
    return monthlyPeriodFromStart(y, m, cfg.startDay)
  }
  const len = PERIOD_WEEKS[cfg.frequency as Exclude<PeriodFrequency, 'monthly'>] * 7
  const start = addDays(period.start, delta * len)
  return { start, end: addDays(start, len - 1) }
}
