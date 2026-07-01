import { describe, it, expect } from 'vitest'
import { computeFundingPlan } from './funding'

describe('computeFundingPlan', () => {
  it('computes pot funding, per-person split, joint contribution, and unassigned (equal basis)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: null },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]

    const pots = [
      { id: 'alice-pot', name: 'Alice Personal', ownerId: 'alice', isDrawdown: false },
      { id: 'bob-pot', name: 'Bob Personal', ownerId: 'bob', isDrawdown: false },
      { id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint', isDrawdown: false },
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
      expenses,
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
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: 3 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: 1 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]

    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint', isDrawdown: false }]

    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 4000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({
      pots,
      expenses,
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
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]
    const pots = [{ id: 'alice-pot', name: 'Alice Personal', ownerId: 'alice', isDrawdown: false }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: false,
        shares: [{ ownerId: 'alice', amount: 5000, potId: 'alice-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, expenses, members, jointContributionBasis: 'equal' })
    const alicePot = plan.pots.find((p) => p.potId === 'alice-pot')!
    expect(alicePot.fundingPerMonth).toBe(0)
    expect(plan.unassignedFundingPerMonth).toBe(0)
  })

  it('drawdown pots do not count toward personalPotFunding or jointPotFundingTotal', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]
    const pots = [
      { id: 'alice-drawdown', name: 'Alice Drawdown', ownerId: 'alice', isDrawdown: true },
      { id: 'joint-drawdown', name: 'Joint Drawdown', ownerId: 'joint', isDrawdown: true },
    ]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [
          { ownerId: 'alice', amount: 5000, potId: 'alice-drawdown' },
          { ownerId: 'joint', amount: 3000, potId: 'joint-drawdown' },
        ],
      },
    ]

    const plan = computeFundingPlan({ pots, expenses, members, jointContributionBasis: 'equal' })
    // The pot itself still reports fundingPerMonth...
    expect(plan.pots.find((p) => p.potId === 'alice-drawdown')!.fundingPerMonth).toBe(5000)
    // ...but it's excluded from personalPotFunding / jointPotFundingTotal.
    expect(plan.perPerson.find((p) => p.memberId === 'alice')!.personalPotFunding).toBe(0)
    expect(plan.jointPotFundingTotal).toBe(0)
  })

  it('income_proportional basis falls back to equal split (no income data yet)', () => {
    const members = [
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: null },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: null },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint', isDrawdown: false }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({
      pots,
      expenses,
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
      { id: 'alice', kind: 'person' as const, displayName: 'Alice', jointContributionWeight: 0 },
      { id: 'bob', kind: 'person' as const, displayName: 'Bob', jointContributionWeight: 0 },
      { id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null },
    ]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint', isDrawdown: false }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, expenses, members, jointContributionBasis: 'custom' })
    const alice = plan.perPerson.find((p) => p.memberId === 'alice')!
    const bob = plan.perPerson.find((p) => p.memberId === 'bob')!
    expect(alice.jointContribution).toBe(2500)
    expect(bob.jointContribution).toBe(2500)
  })

  it('no persons yields empty perPerson split', () => {
    const members = [{ id: 'joint', kind: 'joint' as const, displayName: 'Joint', jointContributionWeight: null }]
    const pots = [{ id: 'joint-pot', name: 'Joint Savings', ownerId: 'joint', isDrawdown: false }]
    const expenses = [
      {
        recurrence: 'monthly' as const,
        active: true,
        shares: [{ ownerId: 'joint', amount: 5000, potId: 'joint-pot' }],
      },
    ]

    const plan = computeFundingPlan({ pots, expenses, members, jointContributionBasis: 'equal' })
    expect(plan.perPerson).toEqual([])
    expect(plan.jointPotFundingTotal).toBe(5000)
  })
})
