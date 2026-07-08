import { describe, it, expect } from 'vitest'
import { computeFundingPlan, type FundingBillInput } from './funding'
import type { Recurrence } from '../../shared/recurrence'

/** Adapt the old per-share expense fixtures to single-pot bills (one bill per share). */
function toBills(
  expenses: Array<{ recurrence: Recurrence; active: boolean; shares: Array<{ ownerId: string; amount: number; potId: string | null }> }>,
): FundingBillInput[] {
  return expenses.flatMap((e) =>
    e.shares.map((s) => ({
      recurrence: e.recurrence,
      active: e.active,
      funding: 'pot_manual' as const,
      potId: s.potId,
      categoryId: null,
      amount: s.amount,
    })),
  )
}

describe('computeFundingPlan', () => {
  it('computes pot funding, per-person split, joint contribution, and unassigned (equal basis)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]

    const pots = [
      { id: 'alice-pot', name: 'Alice Personal', ownerId: 'alice' },
      { id: 'bob-pot', name: 'Bob Personal', ownerId: 'bob' },
      { id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' },
    ]

    const expenses = [
      // Monthly expense: alice 5000/mo -> alice-pot, unassigned 1000/mo (potId null)
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [
          { ownerId: 'alice', amount: 5000, potId: 'alice-pot' },
          { ownerId: 'bob', amount: 1000, potId: null },
        ],
      },
      // Yearly expense: bob 12000/yr -> bob-pot (=1000/mo), joint 24000/yr -> joint-pot (=2000/mo)
      {
        recurrence: 'yearly' as const,
        active: true,
        shares: [
          { ownerId: 'bob', amount: 12000, potId: 'bob-pot' },
          { ownerId: 'joint', amount: 24000, potId: 'joint-pot' },
        ],
      },
    ]

    const plan = computeFundingPlan({
      pots,
      bills: toBills(expenses),
      setAsides: [],
      members,
      jointContributionBasis: 'equal',
    })

    const alicePot = plan.pots.find((p) => p.potId === 'alice-pot')!
    const bobPot = plan.pots.find((p) => p.potId === 'bob-pot')!
    const jointPot = plan.pots.find((p) => p.potId === 'joint-pot')!

    expect(alicePot.fundingPerMonth).toBe(5000)
    expect(bobPot.fundingPerMonth).toBe(1000)
    expect(jointPot.fundingPerMonth).toBe(2000)

    expect(plan.jointPotFundingTotal).toBe(2000)
    expect(plan.unassignedFundingPerMonth).toBe(1000)

    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!

    expect(alice.personalPotFunding).toBe(5000)
    expect(bob.personalPotFunding).toBe(1000)

    // Equal split of 2000 across 2 people -> 1000 each
    expect(alice.jointContribution).toBe(1000)
    expect(bob.jointContribution).toBe(1000)
    expect(alice.jointContribution + bob.jointContribution).toBe(plan.jointPotFundingTotal)

    expect(alice.setAside).toBe(alice.personalPotFunding + alice.jointContribution)
    expect(bob.setAside).toBe(bob.personalPotFunding + bob.jointContribution)
    expect(alice.setAside).toBe(6000)
    expect(bob.setAside).toBe(2000)
  })

  it('splits joint contribution by custom weights (3:1)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: 3, monthlyIncome: 0 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: 1, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]

    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' }]

    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 4000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({
      pots,
      bills: toBills(expenses),
      setAsides: [],
      members,
      jointContributionBasis: 'custom',
    })

    expect(plan.jointPotFundingTotal).toBe(4000)

    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!

    // 3:1 split of 4000 -> 3000 / 1000
    expect(alice.jointContribution).toBe(3000)
    expect(bob.jointContribution).toBe(1000)
    expect(alice.jointContribution + bob.jointContribution).toBe(plan.jointPotFundingTotal)
    expect(alice.setAside).toBe(3000)
    expect(bob.setAside).toBe(1000)
  })

  it('inactive expenses do not contribute to funding', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [{ id: 'alice-pot', name: 'Alice Personal', ownerId: 'alice' }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: false,
        shares: [{ ownerId: 'alice', amount: 5000, potId: 'alice-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'equal' })
    const alicePot = plan.pots.find((p) => p.potId === 'alice-pot')!
    expect(alicePot.fundingPerMonth).toBe(0)
    expect(plan.unassignedFundingPerMonth).toBe(0)
  })

  it('every funded pot counts toward personalPotFunding and jointPotFundingTotal', () => {
    // Savings pots you fund monthly (e.g. cash savings) must be part of the plan.
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [
      { id: 'alice-savings', name: 'Alice Savings', ownerId: 'alice' },
      { id: 'joint-savings', name: 'Joint Savings', ownerId: 'joint' },
    ]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [
          { ownerId: 'alice', amount: 5000, potId: 'alice-savings' },
          { ownerId: 'joint', amount: 3000, potId: 'joint-savings' },
        ],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'equal' })
    expect(plan.pots.find((p) => p.potId === 'alice-savings')!.fundingPerMonth).toBe(5000)
    expect(plan.perPerson.find((p) => p.memberId === 'alice')!.personalPotFunding).toBe(5000)
    expect(plan.jointPotFundingTotal).toBe(3000)
  })

  it('income_proportional basis falls back to equal split (no income data yet)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({
      pots,
      bills: toBills(expenses),
      setAsides: [],
      members,
      jointContributionBasis: 'income_proportional',
    })

    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!
    expect(alice.jointContribution).toBe(2500)
    expect(bob.jointContribution).toBe(2500)
  })

  it('custom weights all zero falls back to equal split', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: 0, monthlyIncome: 0 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: 0, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'custom' })
    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!
    expect(alice.jointContribution).toBe(2500)
    expect(bob.jointContribution).toBe(2500)
  })

  it('income_proportional basis splits the joint contribution by each person\'s income share', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 300000 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: null, monthlyIncome: 100000 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 4000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'income_proportional' })
    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!
    // 3:1 income → 3000 / 1000 of the 4000 joint total
    expect(alice.jointContribution).toBe(3000)
    expect(bob.jointContribution).toBe(1000)
    expect(alice.jointContribution + bob.jointContribution).toBe(plan.jointPotFundingTotal)
  })

  it('remainder is monthly income minus set-aside', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 250000 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [
      { id: 'alice-pot', name: 'Alice Personal', ownerId: 'alice' },
      { id: 'joint-pot', name: 'Joint', ownerId: 'joint' },
    ]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [
          { ownerId: 'alice', amount: 40000, potId: 'alice-pot' },
          { ownerId: 'joint', amount: 20000, potId: 'joint-pot' },
        ],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'equal' })
    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    // set-aside = 40000 personal + 20000 joint (only person) = 60000; remainder = 250000 − 60000
    expect(alice.setAside).toBe(60000)
    expect(alice.monthlyIncome).toBe(250000)
    expect(alice.remainder).toBe(190000)
  })

  it('emergency fund = monthly bills × months, attributed to the pot owner (main → joint)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null, monthlyIncome: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 },
    ]
    const pots = [
      { id: 'alice-pot', name: 'Alice Bills', ownerId: 'alice' },
      { id: 'joint-pot', name: 'Joint Bills', ownerId: 'joint' },
    ]
    const bills = [
      { recurrence: 'monthly' as const, active: true, funding: 'pot_manual' as const, potId: 'alice-pot', categoryId: null, amount: 30000 },
      { recurrence: 'monthly' as const, active: true, funding: 'pot_manual' as const, potId: 'joint-pot', categoryId: null, amount: 20000 },
      // A main-account bill is attributed to the joint member.
      { recurrence: 'monthly' as const, active: true, funding: 'main' as const, potId: null, categoryId: 'c1', amount: 1000 },
    ]

    const plan = computeFundingPlan({ pots, bills, setAsides: [], members, jointContributionBasis: 'equal', emergencyFundMonths: 6 })
    const ef = plan.emergencyFund

    expect(ef.months).toBe(6)
    const alice = ef.perOwner.find((o) => o.memberId === 'alice')!
    const joint = ef.perOwner.find((o) => o.memberId === 'joint')!
    expect(alice.monthlyBills).toBe(30000)
    expect(alice.target).toBe(180000) // 30000 × 6
    expect(joint.monthlyBills).toBe(21000) // 20000 pot + 1000 main
    expect(joint.target).toBe(126000)
    expect(ef.totalMonthlyBills).toBe(51000)
    expect(ef.total).toBe(306000)
  })

  it('emergency fund defaults to 3 months when unset', () => {
    const members = [{ id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 }]
    const pots = [{ id: 'joint-pot', name: 'Joint', ownerId: 'joint' }]
    const bills = [{ recurrence: 'monthly' as const, active: true, funding: 'pot_manual' as const, potId: 'joint-pot', categoryId: null, amount: 10000 }]
    const plan = computeFundingPlan({ pots, bills, setAsides: [], members, jointContributionBasis: 'equal' })
    expect(plan.emergencyFund.months).toBe(3)
    expect(plan.emergencyFund.total).toBe(30000)
  })

  it('no persons yields empty perPerson split', () => {
    const members = [{ id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null, monthlyIncome: 0 }]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint' }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, bills: toBills(expenses), setAsides: [], members, jointContributionBasis: 'equal' })
    expect(plan.perPerson).toEqual([])
    expect(plan.jointPotFundingTotal).toBe(5000)
  })
})
