/** Savings-goal planning (hearth-planning#15). Pure: dates are `YYYY-MM-DD`,
 *  amounts integer minor units, contributions per budget period. Shared so the
 *  client can redraw a what-if without a round trip.
 *
 *  Money is assumed to land once per budget period on its start day (the
 *  "should hold" rule). Projections are money put by from now, ignoring future
 *  payouts; they're compared against the cumulative cost due by each deadline,
 *  so a payout before the goal date is already counted on the "needed" side. */
import { addDays } from './dates'
import { paydaysBetween, periodForDate, shiftPeriod, type PeriodConfig } from './period'
import { periodToMonthly } from './recurrence'
import { slugify } from './slug'

const SHORT_ID = /^[0-9a-z]{6}(?=-|$)/

/** A goal's URL segment: its fixed short id, then its name as a slug for
 *  people to read — `k3x9p2-wedding`. Only the short id is ever looked up. */
export const goalPath = (shortId: string, name: string): string => {
  const slug = slugify(name)
  return slug ? `${shortId}-${slug}` : shortId
}

/** The short id at the front of a goal's URL segment, or null if there isn't one. */
export const shortIdOf = (path: string): string | null => SHORT_ID.exec(path)?.[0] ?? null

/** How close an unfunded deadline has to be before it counts as at risk. */
export const AT_RISK_DAYS = 14

export interface SavingsPlanItem {
  id: string
  name: string
  amount: number
  /** Null means due on the goal date. */
  dueDate: string | null
  paidOn: string | null
}

export interface SavingsPlanBalance {
  asOfDate: string
  amount: number
}

export interface SavingsPlanInput {
  targetAmount: number
  targetDate: string
  items: SavingsPlanItem[]
  balances: SavingsPlanBalance[]
  /** What goes into the pot per budget period now. */
  contribution: number
  today: string
  period: PeriodConfig
}

/** Something the plan has to pay for: an unpaid item, or the part of the target
 *  no unpaid item accounts for (`itemId` null) — the headroom. */
export interface PlanLine {
  itemId: string | null
  name: string
  amount: number
  due: string
}

export interface ItemFlag {
  kind: 'overdue' | 'at_risk'
  /** How much less than it needs the pot will hold by the item's deadline. */
  shortBy: number
}

export interface PlanPoint {
  date: string
  amount: number
}

export interface SavingsOutcome {
  /** Put by on the goal date at this contribution. */
  final: number
  /** What the goal date needs: the target, or the unpaid items when they cost more. */
  required: number
  /** `final − required`: positive is over, negative short. */
  difference: number
  /** The first payday `required` is met, today if it already is; null if not by the goal date. */
  reachedOn: string | null
  /** Plan lines the money won't cover by their deadlines, earliest first. */
  short: PlanLine[]
  /** The short lines with no payday left before their deadline: no contribution reaches them. */
  stranded: PlanLine[]
}

export interface SavingsPlan {
  /** What's in the pot today: the latest balance, plus paydays since, less items paid since. */
  balanceNow: number
  /** The recorded balance that `balanceNow` builds on; null when none is recorded yet. */
  anchor: SavingsPlanBalance | null
  lines: PlanLine[]
  /** The lowest per-period contribution that covers every line by its deadline,
   *  rounded up to a whole minor unit. Lines with no payday left are excluded —
   *  no contribution can reach them; they surface as flags. */
  neededPerPeriod: number
  outcome: SavingsOutcome
  flags: Record<string, ItemFlag>
}

const dueOf = (item: SavingsPlanItem, targetDate: string): string => item.dueDate ?? targetDate

// Round up, ignoring float noise so an exact 975.0000000001 isn't charged as 976.
const ceilMinor = (value: number): number => Math.max(0, Math.ceil(value - 1e-9))

/** The unpaid items plus the unitemised remainder of the target, by deadline. */
export function planLines(input: Pick<SavingsPlanInput, 'targetAmount' | 'targetDate' | 'items'>): PlanLine[] {
  const unpaid = input.items.filter((item) => !item.paidOn)
  const lines: PlanLine[] = unpaid.map((item) => ({
    itemId: item.id,
    name: item.name,
    amount: item.amount,
    due: dueOf(item, input.targetDate),
  }))
  const headroom = input.targetAmount - unpaid.reduce((sum, item) => sum + item.amount, 0)
  if (headroom > 0) lines.push({ itemId: null, name: 'Not itemised yet', amount: headroom, due: input.targetDate })
  return lines.sort((a, b) => a.due.localeCompare(b.due))
}

/** The latest balance recorded on or before `today`. */
export function latestBalance(balances: SavingsPlanBalance[], today: string): SavingsPlanBalance | null {
  return balances
    .filter((b) => b.asOfDate <= today)
    .reduce<SavingsPlanBalance | null>((latest, b) => (!latest || b.asOfDate > latest.asOfDate ? b : latest), null)
}

/** An item paid on the day of a recorded balance counts as already out of it —
 *  you read the balance after paying. Only items paid later come off. */
export function balanceNow(input: SavingsPlanInput): number {
  const anchor = latestBalance(input.balances, input.today)
  if (!anchor) return 0
  const paidSince = input.items
    .filter((item) => item.paidOn && item.paidOn > anchor.asOfDate && item.paidOn <= input.today)
    .reduce((sum, item) => sum + item.amount, 0)
  return anchor.amount + input.contribution * paydaysBetween(anchor.asOfDate, input.today, input.period) - paidSince
}

const cumulativeDue = (lines: PlanLine[], on: string): number =>
  lines.filter((line) => line.due <= on).reduce((sum, line) => sum + line.amount, 0)

/** Put by on `on` at `contribution`, starting from today's balance. */
const projectedOn = (input: SavingsPlanInput, now: number, contribution: number, on: string): number =>
  now + contribution * paydaysBetween(input.today, on, input.period)

/** Every payday from today to the goal date at `contribution`, opening on today
 *  and closing on the goal date itself, so the line runs the whole way. */
export function projection(input: SavingsPlanInput, contribution: number): PlanPoint[] {
  const now = balanceNow(input)
  const points: PlanPoint[] = [{ date: input.today, amount: now }]
  let paid = now
  for (let p = shiftPeriod(periodForDate(input.today, input.period), 1, input.period); p.start <= input.targetDate; p = shiftPeriod(p, 1, input.period)) {
    paid += contribution
    points.push({ date: p.start, amount: paid })
  }
  if (points.at(-1)!.date < input.targetDate) points.push({ date: input.targetDate, amount: paid })
  return points
}

/** The cumulative cost due by each deadline from today, as steps: one point
 *  opening on today, then one per later deadline. */
export function neededSteps(input: SavingsPlanInput): PlanPoint[] {
  const lines = planLines(input)
  const deadlines = [...new Set(lines.map((line) => line.due))].filter((due) => due > input.today)
  return [
    { date: input.today, amount: cumulativeDue(lines, input.today) },
    ...deadlines.map((due) => ({ date: due, amount: cumulativeDue(lines, due) })),
  ]
}

export function outcomeFor(input: SavingsPlanInput, contribution: number): SavingsOutcome {
  const now = balanceNow(input)
  const lines = planLines(input)
  const final = projectedOn(input, now, contribution, input.targetDate)
  // Unpaid items costing more than the target leave no headroom line, so the
  // goal date needs their total, not the target.
  const required = Math.max(input.targetAmount, cumulativeDue(lines, input.targetDate))
  const reachedOn = now >= required
    ? input.today
    : projection(input, contribution).find((point) => point.amount >= required)?.date ?? null
  const short = lines.filter((line) => projectedOn(input, now, contribution, line.due) < cumulativeDue(lines, line.due))
  return {
    final,
    required,
    difference: final - required,
    reachedOn,
    short,
    stranded: short.filter((line) => paydaysBetween(input.today, line.due, input.period) === 0),
  }
}

export function neededPerPeriod(input: SavingsPlanInput): number {
  const now = balanceNow(input)
  const lines = planLines(input)
  let needed = 0
  for (const line of lines) {
    const gap = cumulativeDue(lines, line.due) - now
    const paydays = paydaysBetween(input.today, line.due, input.period)
    if (gap > 0 && paydays > 0) needed = Math.max(needed, gap / paydays)
  }
  return ceilMinor(needed)
}

/** Unpaid items in trouble at the current contribution: past their deadline and
 *  not covered, or due within {@link AT_RISK_DAYS} and won't be. */
export function itemFlags(input: SavingsPlanInput): Record<string, ItemFlag> {
  const now = balanceNow(input)
  const lines = planLines(input)
  const soon = addDays(input.today, AT_RISK_DAYS)
  const flags: Record<string, ItemFlag> = {}
  for (const line of lines) {
    if (!line.itemId || line.due > soon) continue
    const shortBy = cumulativeDue(lines, line.due) - projectedOn(input, now, input.contribution, line.due)
    if (shortBy <= 0) continue
    flags[line.itemId] = { kind: line.due < input.today ? 'overdue' : 'at_risk', shortBy }
  }
  return flags
}

export function savingsPlan(input: SavingsPlanInput): SavingsPlan {
  return {
    balanceNow: balanceNow(input),
    anchor: latestBalance(input.balances, input.today),
    lines: planLines(input),
    neededPerPeriod: neededPerPeriod(input),
    outcome: outcomeFor(input, input.contribution),
    flags: itemFlags(input),
  }
}

/** The monthly set-aside that funds `perPeriod` on the household's cycle.
 *  Set-asides only take monthly/quarterly/yearly, so a weekly-cycle figure is
 *  stored monthly — rounded up, so the funding plan never comes in short. */
export function monthlySetAsideFor(perPeriod: number, period: PeriodConfig): number {
  return ceilMinor(periodToMonthly(perPeriod, period.frequency))
}
