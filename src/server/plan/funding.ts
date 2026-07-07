import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { allocate } from '../../shared/money'

/** A bill (money out). Pot-funded bills fund their pot; `main` bills are paid from the main account. */
export interface FundingBillInput {
  recurrence: Recurrence
  active: boolean
  funding: 'pot_manual' | 'pot_auto' | 'main'
  potId: string | null
  categoryId: string | null
  amount: number
}

/** A set-aside (money in) — a recurring contribution that fills a single pot. */
export interface FundingSetAsideInput {
  recurrence: Recurrence
  active: boolean
  potId: string
  amount: number
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
  /** Bills paid straight from the main account (funding = 'main'), monthly. */
  mainAccountFundingPerMonth: number
  mainAccountByCategory: Array<{ categoryId: string | null; fundingPerMonth: number }>
}

export function computeFundingPlan(input: {
  pots: FundingPotInput[]
  bills: FundingBillInput[]
  setAsides: FundingSetAsideInput[]
  members: FundingMemberInput[]
  jointContributionBasis: 'equal' | 'income_proportional' | 'custom'
}): FundingPlan {
  const { pots, bills, setAsides, members, jointContributionBasis } = input

  const activeBills = bills.filter((b) => b.active)
  const activeSetAsides = setAsides.filter((s) => s.active)

  // Sum monthly-equivalent inflows per potId at full precision (round once per pot).
  // A pot is funded by the bills it pays AND the set-asides that fill it.
  const monthlyByPotId = new Map<string | null, number>()
  const addToPot = (potId: string | null, monthly: number): void => {
    monthlyByPotId.set(potId, (monthlyByPotId.get(potId) ?? 0) + monthly)
  }
  const mainByCategory = new Map<string | null, number>()
  let mainTotal = 0

  for (const bill of activeBills) {
    const monthly = normaliseToMonthly(bill.amount, bill.recurrence)
    if (bill.funding === 'main') {
      mainByCategory.set(bill.categoryId, (mainByCategory.get(bill.categoryId) ?? 0) + monthly)
      mainTotal += monthly
    } else {
      addToPot(bill.potId, monthly)
    }
  }
  for (const s of activeSetAsides) {
    addToPot(s.potId, normaliseToMonthly(s.amount, s.recurrence))
  }

  const potFundingById = new Map<string, number>()
  const potFundings: PotFunding[] = pots.map((pot) => {
    const fundingPerMonth = roundMinor(monthlyByPotId.get(pot.id) ?? 0)
    potFundingById.set(pot.id, fundingPerMonth)
    return { potId: pot.id, name: pot.name, ownerId: pot.ownerId, fundingPerMonth }
  })

  const unassignedFundingPerMonth = roundMinor(monthlyByPotId.get(null) ?? 0)
  const mainAccountFundingPerMonth = roundMinor(mainTotal)
  const mainAccountByCategory = [...mainByCategory.entries()].map(([categoryId, m]) => ({
    categoryId,
    fundingPerMonth: roundMinor(m),
  }))

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

  // Main-account bills are a shared household cost, split like joint pot funding.
  const jointSplitBase = jointPotFundingTotal + mainAccountFundingPerMonth

  // Determine weights for splitting the joint base across persons.
  let weights: number[]
  if (jointContributionBasis === 'custom') {
    const customWeights = persons.map((p) => p.jointContributionWeight ?? 0)
    const allZero = customWeights.every((w) => w === 0)
    weights = allZero ? persons.map(() => 1) : customWeights
  } else if (jointContributionBasis === 'income_proportional') {
    const incomeWeights = persons.map((p) => p.monthlyIncome)
    const allZero = incomeWeights.every((w) => w <= 0)
    weights = allZero ? persons.map(() => 1) : incomeWeights.map((w) => Math.max(w, 0))
  } else {
    weights = persons.map(() => 1) // 'equal'
  }

  const jointShares = persons.length > 0 ? allocate(jointSplitBase, weights) : []

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
    mainAccountFundingPerMonth,
    mainAccountByCategory,
  }
}
