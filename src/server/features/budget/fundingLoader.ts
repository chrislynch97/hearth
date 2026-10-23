import { eq, isNull } from 'drizzle-orm'
import type { DB } from '../../db/client'
import { scopeWhere } from '../../trpc/tenant'
import { expense, setAside, household, member, pot } from '../../db/schema'
import { computeFundingPlan, type FundingPlan } from './funding'
import { computeIncomeByMember } from '../income/service'
import { periodConfig } from "@shared/period"
import type { Recurrence } from "@shared/recurrence"

export type HouseholdRow = typeof household.$inferSelect
export type MemberRow = typeof member.$inferSelect

export interface LoadedFundingPlan {
  plan: FundingPlan
  members: MemberRow[]
  household: HouseholdRow | undefined
}

/** Load a household's live budget and compute its funding plan. Shared by the
 *  Funding page's `plan.funding` and the payday PDF, so both show the same figures. */
export async function loadFundingPlan(db: DB, householdId: string): Promise<LoadedFundingPlan> {
  const pots = await db
    .select()
    .from(pot)
    .where(scopeWhere(householdId, pot.householdId, isNull(pot.archivedAt)))

  const expenses = await db
    .select()
    .from(expense)
    .where(scopeWhere(householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))

  const members = await db
    .select()
    .from(member)
    .where(scopeWhere(householdId, member.householdId, isNull(member.archivedAt)))
  const incomeByMember = await computeIncomeByMember(db, householdId)

  const [householdRow] = await db.select().from(household).where(eq(household.id, householdId))
  const jointContributionBasis = (householdRow?.jointContributionBasis ?? 'equal') as
    | 'equal'
    | 'income_proportional'
    | 'custom'
  const jointFundingModel = (householdRow?.jointFundingModel ?? 'split') as 'split' | 'pooled'

  const setAsides = await db
    .select()
    .from(setAside)
    .where(scopeWhere(householdId, setAside.householdId, isNull(setAside.archivedAt), eq(setAside.active, 1)))

  const plan = computeFundingPlan({
    pots: pots.map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.ownerId,
    })),
    bills: expenses.map((e) => ({
      recurrence: e.recurrence as Recurrence,
      active: e.active === 1,
      funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
      potId: e.potId,
      categoryId: e.categoryId,
      amount: e.amount ?? 0,
      includeInEmergencyFund: e.includeInEmergencyFund === 1,
    })),
    setAsides: setAsides.map((s) => ({
      recurrence: s.recurrence as Recurrence,
      active: s.active === 1,
      potId: s.potId,
      amount: s.amount,
      includeInEmergencyFund: s.includeInEmergencyFund === 1,
    })),
    members: members.map((m) => ({
      id: m.id,
      kind: m.kind as 'person' | 'joint',
      displayName: m.displayName,
      jointContributionWeight: m.jointContributionWeight,
      monthlyIncome: incomeByMember.get(m.id)?.monthlyIncome ?? 0,
    })),
    jointContributionBasis,
    jointFundingModel,
    frequency: periodConfig(householdRow ?? 1).frequency,
    emergencyFundMonths: householdRow?.emergencyFundMonths ?? 3,
  })

  return { plan, members, household: householdRow }
}
