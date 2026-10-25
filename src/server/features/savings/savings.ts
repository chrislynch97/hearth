import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { scopeWhere } from '../../trpc/tenant'
import { household, pot, savingsBalance, savingsGoal, savingsItem, setAside } from '../../db/schema'
import type { SavingsBalance, SavingsGoal, SavingsItem, SetAside } from '../../db/schema'
import type { DBOrTx } from '../../db/client'
import { periodConfig, type PeriodConfig } from '@shared/period'
import { normaliseToPeriod, roundMinor, type Recurrence } from '@shared/recurrence'
import { savingsPlan, type SavingsPlan, type SavingsPlanInput } from '@shared/savings'
import { uniqueSlugs } from '@shared/slug'

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
  goal: SavingsGoal,
  items: SavingsItem[],
  balances: SavingsBalance[],
  contribution: number,
  today: string,
  period: PeriodConfig,
): SavingsPlanInput {
  return {
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    items: items.map((i) => ({ id: i.id, name: i.name, amount: i.amount, dueDate: i.dueDate, paidOn: i.paidOn })),
    balances: balances.map((b) => ({ asOfDate: b.asOfDate, amount: b.amount })),
    contribution,
    today,
    period,
  }
}

export interface GoalPlan {
  goal: SavingsGoal
  /** The goal's name as it appears in the planner's URL. */
  slug: string
  potName: string
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

/** Goals' plans, soonest first, from five reads however many goals there are.
 *  Slugs are worked out across every goal in the household, oldest first, so a
 *  filter never renumbers one and a new namesake never takes an old one's. */
export async function loadGoalPlans(db: DBOrTx, householdId: string, today: string, filter: GoalFilter = {}): Promise<LoadedGoalPlans> {
  const [all, period] = await Promise.all([
    db
      .select({ goal: savingsGoal, potName: pot.name })
      .from(savingsGoal)
      .innerJoin(pot, eq(savingsGoal.potId, pot.id))
      .where(scopeWhere(householdId, savingsGoal.householdId))
      .orderBy(asc(savingsGoal.createdAt), asc(savingsGoal.id)),
    loadPeriod(db, householdId),
  ])
  const slugs = uniqueSlugs(all.map(({ goal }) => goal.name), 'goal')
  const slugById = new Map(all.map(({ goal }, i) => [goal.id, slugs[i]!]))
  const goals = all
    .filter(({ goal }) => (!filter.goalIds || filter.goalIds.includes(goal.id)) && (!filter.live || goal.archivedAt === null))
    .sort((a, b) => a.goal.targetDate.localeCompare(b.goal.targetDate) || a.goal.name.localeCompare(b.goal.name))
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

  const plans = goals.map(({ goal, potName }) => {
    const own = sortItems(items.filter((i) => i.goalId === goal.id), goal.targetDate)
    const ownBalances = balances.filter((b) => b.goalId === goal.id)
    const ownLines = lines.filter((l) => l.potId === goal.potId)
    const contribution = contributionPerPeriod(ownLines, period)
    return {
      goal,
      slug: slugById.get(goal.id)!,
      potName,
      items: own,
      balances: ownBalances,
      contribution,
      contributionLineCount: ownLines.length,
      plan: savingsPlan(planInput(goal, own, ownBalances, contribution, today, period)),
    }
  })
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
          due: item.dueDate ?? p.goal.targetDate,
          kind: flag.kind,
          shortBy: flag.shortBy,
        }]
      }),
    )
    .sort((a, b) => a.due.localeCompare(b.due))
}
