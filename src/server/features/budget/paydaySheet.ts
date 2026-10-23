import type { FundingPlan, JointPool } from './funding'
import { periodConfig, periodForDate, periodUnitLabel, type Period } from "@shared/period"
import { roundMinor } from "@shared/recurrence"

/** The payday sheet (issue #36): what has to move where this period, laid out for
 *  a read-through before payday. Pure data, all amounts whole minor units, so the
 *  renderer only formats and the scheduled send (#37) can reuse it. */
export interface PaydaySheet {
  householdName: string
  period: Period
  /** Per-period suffix, e.g. `/mo`. */
  unit: string
  generatedAt: Date
  people: Array<{ name: string; personalPots: number; jointContribution: number; setAside: number }>
  /** Pots with something to move, grouped by owner: people first, then joint. */
  potGroups: Array<{ ownerName: string; pots: Array<{ name: string; amount: number }>; total: number }>
  jointPotsTotal: number
  /** Only under pooled funding, where the pool is how joint costs get paid. */
  jointPool: JointPool | null
  mainAccount: { rows: Array<{ name: string; amount: number }>; total: number }
  /** Outgoings not assigned to any pot — a warning line when non-zero. */
  unassigned: number
}

export interface PaydaySheetInput {
  plan: FundingPlan
  members: Array<{ id: string; kind: string; displayName: string }>
  categories: Array<{ id: string; name: string }>
  household: {
    displayName: string
    budgetPeriodFrequency?: string | null
    budgetPeriodStartDay?: number | null
    budgetPeriodAnchor?: string | null
  }
  /** `YYYY-MM-DD`; picks the period. */
  today: string
  generatedAt: Date
}

export function buildPaydaySheet(input: PaydaySheetInput): PaydaySheet {
  const { plan, members, categories, household } = input
  const cfg = periodConfig(household)
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  // People in the plan's order, then joint, then any owner no longer listed.
  const ownerOrder = [
    ...plan.perPerson.map((p) => p.memberId),
    ...members.filter((m) => m.kind === 'joint').map((m) => m.id),
  ]
  const ownerName = new Map(members.map((m) => [m.id, m.displayName]))
  const potsByOwner = new Map<string, Array<{ name: string; amount: number }>>()
  for (const p of plan.pots) {
    const amount = roundMinor(p.fundingPerPeriod)
    if (amount === 0) continue
    const list = potsByOwner.get(p.ownerId) ?? []
    list.push({ name: p.name, amount })
    potsByOwner.set(p.ownerId, list)
  }
  const ownerIds = [...ownerOrder.filter((id) => potsByOwner.has(id)), ...[...potsByOwner.keys()].filter((id) => !ownerOrder.includes(id))]

  const mainRows = plan.mainAccountByCategory
    .map((r) => ({
      name: (r.categoryId && categoryName.get(r.categoryId)) || 'Uncategorised',
      amount: roundMinor(r.fundingPerPeriod),
    }))
    .filter((r) => r.amount !== 0)

  return {
    householdName: household.displayName,
    period: periodForDate(input.today, cfg),
    unit: periodUnitLabel(cfg.frequency),
    generatedAt: input.generatedAt,
    people: plan.perPerson.map((p) => ({
      name: p.displayName,
      personalPots: roundMinor(p.personalPotFunding),
      jointContribution: roundMinor(p.jointContribution),
      setAside: roundMinor(p.setAside),
    })),
    potGroups: ownerIds.map((id) => {
      const pots = (potsByOwner.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
      return { ownerName: ownerName.get(id) ?? 'Former member', pots, total: pots.reduce((sum, p) => sum + p.amount, 0) }
    }),
    jointPotsTotal: roundMinor(plan.jointPotFundingTotal),
    jointPool:
      plan.jointFundingModel === 'pooled'
        ? {
            totalIn: roundMinor(plan.jointPool.totalIn),
            jointCosts: roundMinor(plan.jointPool.jointCosts),
            surplus: roundMinor(plan.jointPool.surplus),
          }
        : null,
    mainAccount: { rows: mainRows, total: roundMinor(plan.mainAccountFundingPerPeriod) },
    unassigned: roundMinor(plan.unassignedFundingPerPeriod),
  }
}
