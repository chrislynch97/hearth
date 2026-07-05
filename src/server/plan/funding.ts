import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { allocate } from '../../shared/money'

export interface FundingShareInput {
  ownerId: string
  amount: number
  potId: string | null
}

export interface FundingExpenseInput {
  recurrence: Recurrence
  active: boolean
  shares: FundingShareInput[]
}

export interface FundingPotInput {
  id: string
  name: string
  ownerId: string
}

export interface FundingMemberInput {
  id: string
  kind: 'person' | 'joint'
  displayName: string
  jointContributionWeight: number | null
  /** Monthly spendable income (spec §6.3); drives income-proportional split and remainder. */
  monthlyIncome: number
}

export interface PotFunding {
  potId: string
  name: string
  ownerId: string
  fundingPerMonth: number
}

export interface PersonFunding {
  memberId: string
  displayName: string
  personalPotFunding: number
  jointContribution: number
  setAside: number
  monthlyIncome: number
  remainder: number
}

export interface FundingPlan {
  pots: PotFunding[]
  perPerson: PersonFunding[]
  jointPotFundingTotal: number
  unassignedFundingPerMonth: number
}

export function computeFundingPlan(input: {
  pots: FundingPotInput[]
  expenses: FundingExpenseInput[]
  members: FundingMemberInput[]
  jointContributionBasis: 'equal' | 'income_proportional' | 'custom'
}): FundingPlan {
  const { pots, expenses, members, jointContributionBasis } = input

  const activeExpenses = expenses.filter((e) => e.active)

  // Sum monthly-equivalent amounts per potId (null = unassigned) at full precision,
  // rounding once at the end per pot.
  const monthlyByPotId = new Map<string | null, number>()
  for (const expense of activeExpenses) {
    for (const share of expense.shares) {
      const monthly = normaliseToMonthly(share.amount, expense.recurrence)
      monthlyByPotId.set(share.potId, (monthlyByPotId.get(share.potId) ?? 0) + monthly)
    }
  }

  const potFundingById = new Map<string, number>()
  const potFundings: PotFunding[] = pots.map((pot) => {
    const fundingPerMonth = roundMinor(monthlyByPotId.get(pot.id) ?? 0)
    potFundingById.set(pot.id, fundingPerMonth)
    return {
      potId: pot.id,
      name: pot.name,
      ownerId: pot.ownerId,
      fundingPerMonth,
    }
  })

  const unassignedFundingPerMonth = roundMinor(monthlyByPotId.get(null) ?? 0)

  const persons = members.filter((m) => m.kind === 'person')
  const jointMember = members.find((m) => m.kind === 'joint')

  const personalPotFundingByMemberId = new Map<string, number>()
  for (const person of persons) {
    const total = pots
      .filter((p) => p.ownerId === person.id)
      .reduce((acc, p) => acc + (potFundingById.get(p.id) ?? 0), 0)
    personalPotFundingByMemberId.set(person.id, total)
  }

  const jointPotFundingTotal = jointMember
    ? pots
        .filter((p) => p.ownerId === jointMember.id)
        .reduce((acc, p) => acc + (potFundingById.get(p.id) ?? 0), 0)
    : 0

  // Determine weights for splitting jointPotFundingTotal across persons.
  let weights: number[]
  if (jointContributionBasis === 'custom') {
    const customWeights = persons.map((p) => p.jointContributionWeight ?? 0)
    const allZero = customWeights.every((w) => w === 0)
    weights = allZero ? persons.map(() => 1) : customWeights
  } else if (jointContributionBasis === 'income_proportional') {
    // Split by each person's share of income; fall back to equal until income exists.
    const incomeWeights = persons.map((p) => p.monthlyIncome)
    const allZero = incomeWeights.every((w) => w <= 0)
    weights = allZero ? persons.map(() => 1) : incomeWeights.map((w) => Math.max(w, 0))
  } else {
    weights = persons.map(() => 1) // 'equal'
  }

  const jointShares = persons.length > 0 ? allocate(jointPotFundingTotal, weights) : []

  const perPerson: PersonFunding[] = persons.map((person, i) => {
    const personalPotFunding = personalPotFundingByMemberId.get(person.id) ?? 0
    const jointContribution = jointShares[i] ?? 0
    const setAside = personalPotFunding + jointContribution
    return {
      memberId: person.id,
      displayName: person.displayName,
      personalPotFunding,
      jointContribution,
      setAside,
      monthlyIncome: person.monthlyIncome,
      remainder: person.monthlyIncome - setAside,
    }
  })

  return {
    pots: potFundings,
    perPerson,
    jointPotFundingTotal,
    unassignedFundingPerMonth,
  }
}
