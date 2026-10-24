import {
  normaliseToMonthly,
  normaliseToPeriod,
  monthlyToPeriod,
  roundMinor,
  type Recurrence,
} from '../../../shared/recurrence'
import type { PeriodFrequency } from '../../../shared/period'
import { allocate } from '../../../shared/money'

/** A bill (money out). Pot-funded bills fund their pot; `main` bills are paid from the main account. */
export interface FundingBillInput {
  recurrence: Recurrence
  active: boolean
  funding: 'pot_manual' | 'pot_auto' | 'main'
  potId: string | null
  categoryId: string | null
  /** `main` only: the person whose own account pays it; null/undefined = joint (issue #32). */
  ownerId?: string | null
  amount: number
  /** Whether this bill counts toward the emergency-fund target (issue #118).
   *  Undefined counts as included, matching the column's default. */
  includeInEmergencyFund?: boolean
}

/** A set-aside (money in) — a recurring contribution that fills a single pot. */
export interface FundingSetAsideInput {
  recurrence: Recurrence
  active: boolean
  potId: string
  amount: number
  /** Whether this set-aside counts toward the emergency-fund target (issue #118).
   *  Undefined counts as included, matching the column's default. */
  includeInEmergencyFund?: boolean
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
  /** Monthly spendable income (spec §6.3); drives income-proportional split and
   *  remainder. Always monthly on input — re-based onto the household's budget
   *  period internally via {@link monthlyToPeriod}. */
  monthlyIncome: number
}

export interface PotFunding {
  potId: string
  name: string
  ownerId: string
  /** Funding needed per budget period (per the household's frequency). */
  fundingPerPeriod: number
}

export interface PersonFunding {
  memberId: string
  displayName: string
  personalPotFunding: number
  /** In 'split' mode: this person's share of the joint costs. In 'pooled' mode:
   *  their whole leftover income (periodIncome − personalPotFunding) paid into
   *  the joint pool. */
  jointContribution: number
  /** Bills paid straight from this person's own account (issue #32). Comes off
   *  the remainder but isn't part of {@link setAside} — no money has to move. */
  personalMainAccount: number
  setAside: number
  /** Spendable income re-based onto the household's budget period. */
  periodIncome: number
  /** Leftover after set-asides. Always 0 in 'pooled' mode (the leftover flows
   *  into joint, so any surplus lives in {@link FundingPlan.jointPool}). */
  remainder: number
}

/** The joint pool under 'pooled' funding: everyone's contributions in, joint
 *  costs out, and the surplus (or shortfall) that remains. Computed in both
 *  modes but only surfaced for the pooled presentation. */
export interface JointPool {
  totalIn: number
  jointCosts: number
  surplus: number
}

/** Emergency-fund target = monthly commitments × months, per account and total.
 *  "Commitments" = bills (money out) plus set-asides (money in) that are flagged
 *  to count, each attributed to whoever owns the pot it touches (issue #118). */
export interface EmergencyFund {
  months: number
  totalMonthlyCommitments: number
  total: number
  perOwner: Array<{ memberId: string; displayName: string; kind: 'person' | 'joint'; monthlyCommitments: number; target: number }>
}

export interface FundingPlan {
  pots: PotFunding[]
  perPerson: PersonFunding[]
  jointPotFundingTotal: number
  unassignedFundingPerPeriod: number
  /** Bills paid straight from the main account (funding = 'main'), per period —
   *  joint and personal alike. */
  mainAccountFundingPerPeriod: number
  /** One row per category and paying account; `ownerId` null = joint. */
  mainAccountByCategory: Array<{ categoryId: string | null; ownerId: string | null; fundingPerPeriod: number }>
  emergencyFund: EmergencyFund
  jointFundingModel: 'split' | 'pooled'
  jointPool: JointPool
  /** Couple surplus: Σ(income − personal set-asides) − joint costs. Identical
   *  in both funding models (only the per-person framing differs). */
  coupleSurplus: number
}

/** Whose account pays a main-account bill: its owner while they're one of the
 *  listed people, else null — joint, including an owner since archived (issue #32). */
export function mainBillOwnerId(ownerId: string | null | undefined, personIds: ReadonlySet<string>): string | null {
  return ownerId && personIds.has(ownerId) ? ownerId : null
}

export function computeFundingPlan(input: {
  pots: FundingPotInput[]
  bills: FundingBillInput[]
  setAsides: FundingSetAsideInput[]
  members: FundingMemberInput[]
  jointContributionBasis: 'equal' | 'income_proportional' | 'custom'
  /** How joint costs are funded (issue #87). 'split' divides them per person by
   *  {@link jointContributionBasis}; 'pooled' has each person contribute their
   *  whole remainder into a joint pool. Defaults to 'split'. */
  jointFundingModel?: 'split' | 'pooled'
  /** The household's budget-period frequency; all funding figures are normalised
   *  to one period of this length. Defaults to 'monthly' (unchanged behaviour). */
  frequency?: PeriodFrequency
  /** How many months of essential bills the emergency fund should cover (default 3). */
  emergencyFundMonths?: number
}): FundingPlan {
  const { pots, bills, setAsides, members, jointContributionBasis } = input
  const jointFundingModel = input.jointFundingModel ?? 'split'
  const frequency = input.frequency ?? 'monthly'
  const emergencyFundMonths = input.emergencyFundMonths ?? 3

  const activeBills = bills.filter((b) => b.active)
  const activeSetAsides = setAsides.filter((s) => s.active)

  // Sum per-period inflows per potId at full precision (round once per pot).
  // A pot is funded by the bills it pays AND the set-asides that fill it.
  const perPeriodByPotId = new Map<string | null, number>()
  const addToPot = (potId: string | null, perPeriod: number): void => {
    perPeriodByPotId.set(potId, (perPeriodByPotId.get(potId) ?? 0) + perPeriod)
  }
  const personIds = new Set(members.filter((m) => m.kind === 'person').map((m) => m.id))
  const mainOwnerOf = (bill: FundingBillInput): string | null => mainBillOwnerId(bill.ownerId, personIds)
  const mainByCategoryOwner = new Map<string, { categoryId: string | null; ownerId: string | null; perPeriod: number }>()
  const personalMainByMemberId = new Map<string, number>()
  let mainTotal = 0
  let mainJointTotal = 0

  for (const bill of activeBills) {
    const perPeriod = normaliseToPeriod(bill.amount, bill.recurrence, frequency)
    if (bill.funding === 'main') {
      const ownerId = mainOwnerOf(bill)
      const key = `${bill.categoryId ?? ''}|${ownerId ?? ''}`
      const row = mainByCategoryOwner.get(key) ?? { categoryId: bill.categoryId, ownerId, perPeriod: 0 }
      row.perPeriod += perPeriod
      mainByCategoryOwner.set(key, row)
      mainTotal += perPeriod
      if (ownerId) personalMainByMemberId.set(ownerId, (personalMainByMemberId.get(ownerId) ?? 0) + perPeriod)
      else mainJointTotal += perPeriod
    } else {
      addToPot(bill.potId, perPeriod)
    }
  }
  for (const s of activeSetAsides) {
    addToPot(s.potId, normaliseToPeriod(s.amount, s.recurrence, frequency))
  }

  const potFundingById = new Map<string, number>()
  const potFundings: PotFunding[] = pots.map((pot) => {
    const fundingPerPeriod = roundMinor(perPeriodByPotId.get(pot.id) ?? 0)
    potFundingById.set(pot.id, fundingPerPeriod)
    return { potId: pot.id, name: pot.name, ownerId: pot.ownerId, fundingPerPeriod }
  })

  const unassignedFundingPerPeriod = roundMinor(perPeriodByPotId.get(null) ?? 0)
  const mainAccountFundingPerPeriod = roundMinor(mainTotal)
  const mainAccountByCategory = [...mainByCategoryOwner.values()].map((r) => ({
    categoryId: r.categoryId,
    ownerId: r.ownerId,
    fundingPerPeriod: roundMinor(r.perPeriod),
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

  // Joint main-account bills are a shared household cost, split like joint pot
  // funding; a person's own main-account bills stay with that person.
  const jointSplitBase = jointPotFundingTotal + roundMinor(mainJointTotal)

  // Determine weights for splitting the joint base across persons.
  let weights: number[]
  if (jointContributionBasis === 'custom') {
    // Clamp any negative weight to 0 (defends against pre-`min(0)` rows): a
    // negative weight breaks allocate's largest-remainder math. If nothing
    // positive remains, fall back to an equal split rather than assigning the
    // whole joint base to nobody.
    const customWeights = persons.map((p) => Math.max(p.jointContributionWeight ?? 0, 0))
    const allZero = customWeights.every((w) => w === 0)
    weights = allZero ? persons.map(() => 1) : customWeights
  } else if (jointContributionBasis === 'income_proportional') {
    // Income is a ratio here, so month-vs-period basis is immaterial to the split.
    const incomeWeights = persons.map((p) => p.monthlyIncome)
    const allZero = incomeWeights.every((w) => w <= 0)
    weights = allZero ? persons.map(() => 1) : incomeWeights.map((w) => Math.max(w, 0))
  } else {
    weights = persons.map(() => 1) // 'equal'
  }

  // Only 'split' divides the joint base by weights; 'pooled' derives each
  // person's contribution from their own leftover income instead.
  const jointShares = jointFundingModel === 'split' && persons.length > 0 ? allocate(jointSplitBase, weights) : []

  const perPerson: PersonFunding[] = persons.map((person, i) => {
    const personalPotFunding = personalPotFundingByMemberId.get(person.id) ?? 0
    const personalMainAccount = roundMinor(personalMainByMemberId.get(person.id) ?? 0)
    // Set-aside is a per-period figure, so compare against per-period income.
    const periodIncome = roundMinor(monthlyToPeriod(person.monthlyIncome, frequency))
    // Pooled: the whole leftover income flows into joint, so nothing personal
    // remains (any surplus is the pool's). Split: take the assigned joint share.
    const jointContribution =
      jointFundingModel === 'pooled' ? periodIncome - personalPotFunding - personalMainAccount : jointShares[i] ?? 0
    const setAside = personalPotFunding + jointContribution
    return {
      memberId: person.id,
      displayName: person.displayName,
      personalPotFunding,
      jointContribution,
      personalMainAccount,
      setAside,
      periodIncome,
      remainder: jointFundingModel === 'pooled' ? 0 : periodIncome - setAside - personalMainAccount,
    }
  })

  // Emergency fund: monthly commitments attributed to whoever owns the pot each
  // one touches, times the months. Bills (money out) drain a pot — main-account
  // bills go to their owner, else joint — and set-asides (money in) fill a pot. Both are
  // recurring monthly demands you'd need cover for, so both count; each item can
  // be excluded via its includeInEmergencyFund flag (issue #118). Bills and
  // set-asides are summed even on the same pot — they're separate commitments.
  const potOwnerById = new Map(pots.map((p) => [p.id, p.ownerId]))
  const commitmentsMonthlyByOwner = new Map<string, number>()
  const addCommitment = (ownerId: string | undefined, monthly: number) => {
    if (ownerId) commitmentsMonthlyByOwner.set(ownerId, (commitmentsMonthlyByOwner.get(ownerId) ?? 0) + monthly)
  }
  for (const b of activeBills) {
    if (b.includeInEmergencyFund === false) continue
    const ownerId =
      b.funding === 'main' ? mainOwnerOf(b) ?? jointMember?.id : b.potId ? potOwnerById.get(b.potId) : undefined
    addCommitment(ownerId, normaliseToMonthly(b.amount, b.recurrence))
  }
  for (const s of activeSetAsides) {
    if (s.includeInEmergencyFund === false) continue
    addCommitment(potOwnerById.get(s.potId), normaliseToMonthly(s.amount, s.recurrence))
  }
  const emergencyOwners = [...persons, ...(jointMember ? [jointMember] : [])]
  const emergencyPerOwner = emergencyOwners.map((m) => {
    const monthlyCommitments = roundMinor(commitmentsMonthlyByOwner.get(m.id) ?? 0)
    return {
      memberId: m.id,
      displayName: m.displayName,
      kind: m.kind,
      monthlyCommitments,
      target: roundMinor(monthlyCommitments * emergencyFundMonths),
    }
  })
  const totalMonthlyCommitments = emergencyPerOwner.reduce((acc, o) => acc + o.monthlyCommitments, 0)
  const emergencyFund: EmergencyFund = {
    months: emergencyFundMonths,
    totalMonthlyCommitments,
    total: roundMinor(totalMonthlyCommitments * emergencyFundMonths),
    perOwner: emergencyPerOwner,
  }

  // Couple surplus = Σ(income − personal set-asides) − joint costs. Model-agnostic:
  // in 'split' it equals Σ remainder; in 'pooled' it equals the pool surplus.
  const coupleSurplus = roundMinor(
    perPerson.reduce((acc, p) => acc + p.periodIncome - p.personalPotFunding - p.personalMainAccount, 0) - jointSplitBase,
  )
  const jointPoolIn = roundMinor(perPerson.reduce((acc, p) => acc + p.jointContribution, 0))
  const jointPool: JointPool = {
    totalIn: jointPoolIn,
    jointCosts: roundMinor(jointSplitBase),
    surplus: roundMinor(jointPoolIn - jointSplitBase),
  }

  return {
    pots: potFundings,
    perPerson,
    jointPotFundingTotal,
    unassignedFundingPerPeriod,
    mainAccountFundingPerPeriod,
    mainAccountByCategory,
    emergencyFund,
    jointFundingModel,
    jointPool,
    coupleSurplus,
  }
}
