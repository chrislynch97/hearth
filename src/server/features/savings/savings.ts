import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { scopeWhere } from '../../trpc/tenant'
import { household, pot, savingsBalance, savingsGoal, savingsItem, setAside } from '../../db/schema'
import type { SavingsBalance, SavingsGoal, SavingsItem, SetAside } from '../../db/schema'
import type { DBOrTx } from '../../db/client'
import { periodConfig, type PeriodConfig } from '@shared/period'
import { normaliseToPeriod, roundMinor, type Recurrence } from '@shared/recurrence'
import { goalPath, planTarget, savingsPlan, type PlanTarget, type SavingsPlan, type SavingsPlanInput } from '@shared/savings'

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/** A fresh goal short id: six random base36 chars not already in `taken`. */
export function newShortId(taken: ReadonlySet<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    // 252 = 36 × 7: drop the top bytes so every character is equally likely.
    if (bytes.some((b) => b >= 252)) continue
    const id = [...bytes].map((b) => BASE36[b % 36]).join('')
    if (!taken.has(id)) return id
  }
}

export async function loadPeriod(db: DBOrTx, householdId: string): Promise<PeriodConfig> {
  const [row] = await db.select().from(household).where(eq(household.id, householdId))
  return periodConfig(row ?? 1)
}

/** A pot's live contribution lines: the active set-asides that fill it. */
export async function contributionLines(db: DBOrTx, householdId: string, potId: string): Promise<SetAside[]> {
  return db
    .select()
    .from(setAside)
    .where(scopeWhere(householdId, setAside.householdId, eq(setAside.potId, potId), eq(setAside.active, 1), isNull(setAside.archivedAt)))
}

/** What the lines put in per budget period, as the funding plan counts it. */
export function contributionPerPeriod(lines: Pick<SetAside, 'amount' | 'recurrence'>[], period: PeriodConfig): number {
  return roundMinor(lines.reduce((sum, l) => sum + normaliseToPeriod(l.amount, l.recurrence as Recurrence, period.frequency), 0))
}

/** Items in plan order: by deadline (the goal date when they have none), then as entered. */
export function sortItems(items: SavingsItem[], targetDate: string): SavingsItem[] {
  return [...items].sort(
    (a, b) => (a.dueDate ?? targetDate).localeCompare(b.dueDate ?? targetDate) || a.sortOrder - b.sortOrder,
  )
}

export function planInput(
  target: PlanTarget,
  items: SavingsItem[],
  balances: SavingsBalance[],
  contribution: number,
  interestRateBp: number | null,
  today: string,
  period: PeriodConfig,
): SavingsPlanInput {
  return {
    ...target,
    items: items.map((i) => ({ id: i.id, name: i.name, amount: i.amount, dueDate: i.dueDate, paidOn: i.paidOn })),
    balances: balances.map((b) => ({ asOfDate: b.asOfDate, amount: b.amount })),
    contribution,
    interestRateBp,
    today,
    period,
  }
}

export interface GoalPlan {
  goal: SavingsGoal
  /** The goal's URL segment, `<shortId>-<name>`; only the short id is looked up. */
  slug: string
  potName: string
  /** The pot's AER in hundredths of a percent, or null. */
  interestRateBp: number | null
  /** What the plan runs against: the goal's own target and date, or for an
   *  item-by-item goal its unpaid items by the last one's date. */
  target: PlanTarget
  items: SavingsItem[]
  balances: SavingsBalance[]
  contribution: number
  /** How many contribution lines the pot has; "Use this" can only rewrite zero or one. */
  contributionLineCount: number
  plan: SavingsPlan
}

export interface GoalFilter {
  goalIds?: string[]
  /** Leave out archived goals. */
  live?: boolean
}

export interface LoadedGoalPlans {
  period: PeriodConfig
  plans: GoalPlan[]
}

/** Goals' plans, soonest first, from five reads however many goals there are. */
export async function loadGoalPlans(db: DBOrTx, householdId: string, today: string, filter: GoalFilter = {}): Promise<LoadedGoalPlans> {
  const [goals, period] = await Promise.all([
    db
      .select({ goal: savingsGoal, potName: pot.name, interestRateBp: pot.interestRateBp })
      .from(savingsGoal)
      .innerJoin(pot, eq(savingsGoal.potId, pot.id))
      .where(
        scopeWhere(
          householdId,
          savingsGoal.householdId,
          filter.goalIds ? inArray(savingsGoal.id, filter.goalIds) : undefined,
          filter.live ? isNull(savingsGoal.archivedAt) : undefined,
        ),
      )
      .orderBy(asc(savingsGoal.name)),
    loadPeriod(db, householdId),
  ])
  if (goals.length === 0) return { period, plans: [] }

  const ids = goals.map((g) => g.goal.id)
  const potIds = goals.map((g) => g.goal.potId)
  const [items, balances, lines] = await Promise.all([
    db.select().from(savingsItem).where(scopeWhere(householdId, savingsItem.householdId, inArray(savingsItem.goalId, ids))),
    db
      .select()
      .from(savingsBalance)
      .where(scopeWhere(householdId, savingsBalance.householdId, inArray(savingsBalance.goalId, ids)))
      .orderBy(asc(savingsBalance.asOfDate)),
    db
      .select()
      .from(setAside)
      .where(scopeWhere(householdId, setAside.householdId, and(inArray(setAside.potId, potIds), eq(setAside.active, 1), isNull(setAside.archivedAt)))),
  ])

  const plans = goals.map(({ goal, potName, interestRateBp }) => {
    const mine = items.filter((i) => i.goalId === goal.id)
    const target = planTarget(goal, mine, today)
    const own = sortItems(mine, target.targetDate)
    const ownBalances = balances.filter((b) => b.goalId === goal.id)
    const ownLines = lines.filter((l) => l.potId === goal.potId)
    const contribution = contributionPerPeriod(ownLines, period)
    return {
      goal,
      slug: goalPath(goal.shortId, goal.name),
      potName,
      interestRateBp,
      target,
      items: own,
      balances: ownBalances,
      contribution,
      contributionLineCount: ownLines.length,
      plan: savingsPlan(planInput(target, own, ownBalances, contribution, interestRateBp, today, period)),
    }
  })
  // An item-by-item goal's date comes from its items, so soonest-first is sorted here, not in SQL.
  plans.sort((a, b) => a.target.targetDate.localeCompare(b.target.targetDate))
  return { period, plans }
}

export interface SavingsAlert {
  goalId: string
  goalSlug: string
  goalName: string
  itemId: string
  itemName: string
  amount: number
  due: string
  kind: 'overdue' | 'at_risk'
  shortBy: number
}

/** Unpaid items on live goals that won't be covered in time — for the Overview. */
export async function savingsAlerts(db: DBOrTx, householdId: string, today: string): Promise<SavingsAlert[]> {
  const { plans } = await loadGoalPlans(db, householdId, today, { live: true })
  return plans
    .flatMap((p) =>
      p.items.flatMap((item) => {
        const flag = p.plan.flags[item.id]
        if (!flag) return []
        return [{
          goalId: p.goal.id,
          goalSlug: p.slug,
          goalName: p.goal.name,
          itemId: item.id,
          itemName: item.name,
          amount: item.amount,
          due: item.dueDate ?? p.target.targetDate,
          kind: flag.kind,
          shortBy: flag.shortBy,
        }]
      }),
    )
    .sort((a, b) => a.due.localeCompare(b.due))
}
