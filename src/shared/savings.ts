/** Savings-goal planning (hearth-planning#15). Pure: dates are `YYYY-MM-DD`,
 *  amounts integer minor units, contributions per budget period. Shared so the
 *  client can redraw a what-if without a round trip.
 *
 *  Money is assumed to land once per budget period on its start day (the
 *  "should hold" rule). Projections are money put by from now, ignoring future
 *  payouts; they're compared against the cumulative cost due by each deadline,
 *  so a payout before the goal date is already counted on the "needed" side.
 *
 *  A pot with an interest rate grows by `(1 + AER)^(days / 365)` between
 *  paydays, so each payday's interest lands before its contribution. */
import { addDays, diffDays } from './dates'
import { periodForDate, shiftPeriod, type PeriodConfig } from './period'
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
  /** The pot's AER in hundredths of a percent; absent or null earns nothing. */
  interestRateBp?: number | null
  today: string
  period: PeriodConfig
}

/** A goal's own target and date: both set, or both null when it's planned item by item. */
export interface GoalTarget {
  targetAmount: number | null
  targetDate: string | null
}

/** What a goal is planned against; see {@link planTarget}. */
export type PlanTarget = Pick<SavingsPlanInput, 'targetAmount' | 'targetDate'>

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
  /** The part of `final` that's interest earned from today. */
  interest: number
  /** The first payday `required` is met, today if it already is; null if not by the goal date. */
  reachedOn: string | null
  /** Plan lines the money won't cover by their deadlines, earliest first. */
  short: PlanLine[]
  /** The short lines with no payday left before their deadline: no contribution reaches them. */
  stranded: PlanLine[]
}

export interface SavingsPlan {
  /** What's in the pot today: the latest balance, plus paydays and interest since, less items paid since. */
  balanceNow: number
  /** The recorded balance that `balanceNow` builds on; null when none is recorded yet. */
  anchor: SavingsPlanBalance | null
  lines: PlanLine[]
  /** The lowest per-period contribution that covers every line by its deadline,
   *  in whole minor units. Lines with no payday left are excluded — no
   *  contribution can reach them; they surface as flags. */
  neededPerPeriod: number
  outcome: SavingsOutcome
  flags: Record<string, ItemFlag>
}

const dueOf = (item: SavingsPlanItem, targetDate: string): string => item.dueDate ?? targetDate

// Round up, ignoring float noise so an exact 975.0000000001 isn't charged as 976.
const ceilMinor = (value: number): number => Math.max(0, Math.ceil(value - 1e-9))

/** What the unpaid items cost: how much of the target they've allocated. */
export const unpaidTotal = (items: Pick<SavingsPlanItem, 'amount' | 'paidOn'>[]): number =>
  items.reduce((sum, item) => (item.paidOn ? sum : sum + item.amount), 0)

/** The target `amount` takes the unpaid items to alongside `otherUnpaid`, when
 *  that's over `target`; null while they fit. */
export const raisedTarget = (target: number, otherUnpaid: number, amount: number): number | null =>
  otherUnpaid + amount > target ? otherUnpaid + amount : null

export const isItemByItem = (goal: GoalTarget): boolean => goal.targetAmount === null || goal.targetDate === null

const latestDue = (items: Pick<SavingsPlanItem, 'dueDate'>[]): string | null =>
  items.reduce<string | null>((latest, item) => (item.dueDate && (!latest || item.dueDate > latest) ? item.dueDate : latest), null)

/** The target and date a goal is planned against. An item-by-item goal has
 *  neither, so its unpaid items are the target, due by the last one's date. */
export function planTarget(
  goal: GoalTarget,
  items: Pick<SavingsPlanItem, 'amount' | 'dueDate' | 'paidOn'>[],
  today: string,
): PlanTarget {
  if (goal.targetAmount !== null && goal.targetDate !== null) return { targetAmount: goal.targetAmount, targetDate: goal.targetDate }
  const unpaid = items.filter((item) => !item.paidOn)
  return { targetAmount: unpaidTotal(unpaid), targetDate: latestDue(unpaid) ?? latestDue(items) ?? today }
}

/** The unpaid items plus the unitemised remainder of the target, by deadline. */
export function planLines(input: Pick<SavingsPlanInput, 'targetAmount' | 'targetDate' | 'items'>): PlanLine[] {
  const unpaid = input.items.filter((item) => !item.paidOn)
  const lines: PlanLine[] = unpaid.map((item) => ({
    itemId: item.id,
    name: item.name,
    amount: item.amount,
    due: dueOf(item, input.targetDate),
  }))
  const headroom = input.targetAmount - unpaidTotal(unpaid)
  if (headroom > 0) lines.push({ itemId: null, name: 'Not itemised yet', amount: headroom, due: input.targetDate })
  return lines.sort((a, b) => a.due.localeCompare(b.due))
}

/** The latest balance recorded on or before `today`. */
export function latestBalance(balances: SavingsPlanBalance[], today: string): SavingsPlanBalance | null {
  return balances
    .filter((b) => b.asOfDate <= today)
    .reduce<SavingsPlanBalance | null>((latest, b) => (!latest || b.asOfDate > latest.asOfDate ? b : latest), null)
}

/** Each payday after `after`, up to and including `upTo`. */
function paydays(after: string, upTo: string, period: PeriodConfig): string[] {
  const days: string[] = []
  for (let p = shiftPeriod(periodForDate(after, period), 1, period); p.start <= upTo; p = shiftPeriod(p, 1, period)) {
    days.push(p.start)
  }
  return days
}

/** What one unit in the pot on `from` has become by `to`. Exactly 1 with no
 *  rate, so a pot without one plans to the penny as it always has. */
const growth = (rateBp: number, from: string, to: string): number =>
  rateBp > 0 && to > from ? (1 + rateBp / 10_000) ** (diffDays(from, to) / 365) : 1

/** An item paid on the day of a recorded balance counts as already out of it —
 *  you read the balance after paying. Only items paid later come off, on their
 *  day, so they stop earning interest from then. */
export function balanceNow(input: SavingsPlanInput): number {
  const anchor = latestBalance(input.balances, input.today)
  if (!anchor) return 0
  const rate = input.interestRateBp ?? 0
  const events = [
    ...paydays(anchor.asOfDate, input.today, input.period).map((date) => ({ date, amount: input.contribution })),
    ...input.items
      .filter((item) => item.paidOn && item.paidOn > anchor.asOfDate && item.paidOn <= input.today)
      .map((item) => ({ date: item.paidOn!, amount: -item.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  let balance = anchor.amount
  let last = anchor.asOfDate
  for (const event of events) {
    balance = balance * growth(rate, last, event.date) + event.amount
    last = event.date
  }
  return Math.round(balance * growth(rate, last, input.today))
}

/** How money put by from today has grown by `date`: today's balance by
 *  `opening`, and one unit in on every payday since to `paid` (the payday count
 *  at 0%). Projections are linear in both, so any contribution is one sum. */
interface Growth {
  date: string
  opening: number
  paid: number
}

/** Today, then each payday up to `until`. */
function growthCurve(input: SavingsPlanInput, until: string): Growth[] {
  const rate = input.interestRateBp ?? 0
  const curve: Growth[] = [{ date: input.today, opening: 1, paid: 0 }]
  for (const date of paydays(input.today, until, input.period)) {
    const last = curve.at(-1)!
    const g = growth(rate, last.date, date)
    curve.push({ date, opening: last.opening * g, paid: last.paid * g + 1 })
  }
  return curve
}

/** The curve on any day: the last payday's, grown on to it. A day before today gets today's. */
function growthOn(input: SavingsPlanInput, curve: Growth[], on: string): Growth {
  const last = curve.findLast((point) => point.date <= on) ?? curve[0]!
  const g = growth(input.interestRateBp ?? 0, last.date, on)
  return { date: on, opening: last.opening * g, paid: last.paid * g }
}

/** Put by at `contribution`, starting from today's balance `now`. */
const projected = (now: number, contribution: number, at: Growth): number =>
  Math.round(now * at.opening + contribution * at.paid)

/** The latest deadline, so a curve reaches every line, even one due after the goal date. */
const lastDue = (input: SavingsPlanInput, lines: PlanLine[]): string =>
  lines.reduce((last, line) => (line.due > last ? line.due : last), input.targetDate)

const cumulativeDue = (lines: PlanLine[], on: string): number =>
  lines.filter((line) => line.due <= on).reduce((sum, line) => sum + line.amount, 0)

/** Every payday from today to the goal date at `contribution`, opening on today
 *  and closing on the goal date itself, so the line runs the whole way. */
export function projection(input: SavingsPlanInput, contribution: number): PlanPoint[] {
  const now = balanceNow(input)
  const curve = growthCurve(input, input.targetDate)
  const points = curve.map((point) => ({ date: point.date, amount: projected(now, contribution, point) }))
  if (points.at(-1)!.date < input.targetDate) {
    points.push({ date: input.targetDate, amount: projected(now, contribution, growthOn(input, curve, input.targetDate)) })
  }
  return points
}

/** What the pot holds on each of `dates` at `contribution`, reckoned as
 *  {@link outcomeFor} does, so a figure shown for a deadline agrees with its verdict. */
export function projectedAt(input: SavingsPlanInput, contribution: number, dates: string[]): number[] {
  const now = balanceNow(input)
  const curve = growthCurve(input, dates.reduce((last, date) => (date > last ? date : last), input.targetDate))
  return dates.map((date) => projected(now, contribution, growthOn(input, curve, date)))
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
  const curve = growthCurve(input, lastDue(input, lines))
  const by = (on: string) => growthOn(input, curve, on)
  const final = projected(now, contribution, by(input.targetDate))
  const paydaysToGo = curve.filter((point) => point.date > input.today && point.date <= input.targetDate).length
  // Unpaid items costing more than the target leave no headroom line, so the
  // goal date needs their total, not the target.
  const required = Math.max(input.targetAmount, cumulativeDue(lines, input.targetDate))
  const reachedOn = now >= required
    ? input.today
    : projection(input, contribution).find((point) => point.amount >= required)?.date ?? null
  const short = lines.filter((line) => projected(now, contribution, by(line.due)) < cumulativeDue(lines, line.due))
  return {
    final,
    required,
    difference: final - required,
    interest: final - (now + contribution * paydaysToGo),
    reachedOn,
    short,
    stranded: short.filter((line) => by(line.due).paid === 0),
  }
}

export function neededPerPeriod(input: SavingsPlanInput): number {
  const now = balanceNow(input)
  const lines = planLines(input)
  const curve = growthCurve(input, lastDue(input, lines))
  const reachable = lines
    .map((line) => ({ due: cumulativeDue(lines, line.due), growth: growthOn(input, curve, line.due) }))
    .filter((line) => line.growth.paid > 0)
  // The same test `outcomeFor` marks a line short by, so the two never disagree.
  const covers = (contribution: number) => reachable.every((line) => projected(now, contribution, line.growth) >= line.due)
  if (covers(0)) return 0
  // More in never covers less, so double past the answer, then halve back onto it.
  let low = 0
  let high = 1
  while (!covers(high)) {
    low = high
    high *= 2
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (covers(mid)) high = mid
    else low = mid
  }
  return high
}

/** Unpaid items in trouble at the current contribution: past their deadline and
 *  not covered, or due within {@link AT_RISK_DAYS} and won't be. */
export function itemFlags(input: SavingsPlanInput): Record<string, ItemFlag> {
  const now = balanceNow(input)
  const lines = planLines(input)
  const curve = growthCurve(input, lastDue(input, lines))
  const soon = addDays(input.today, AT_RISK_DAYS)
  const flags: Record<string, ItemFlag> = {}
  for (const line of lines) {
    if (!line.itemId || line.due > soon) continue
    const shortBy = cumulativeDue(lines, line.due) - projected(now, input.contribution, growthOn(input, curve, line.due))
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
