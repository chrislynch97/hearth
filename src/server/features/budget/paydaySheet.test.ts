import { describe, it, expect } from 'vitest'
import { buildPaydaySheet, type PaydaySheetInput } from './paydaySheet'
import type { FundingPlan } from './funding'

function makePlan(overrides: Partial<FundingPlan> = {}): FundingPlan {
  return {
    pots: [],
    perPerson: [],
    jointPotFundingTotal: 0,
    unassignedFundingPerPeriod: 0,
    mainAccountFundingPerPeriod: 0,
    mainAccountByCategory: [],
    emergencyFund: { months: 3, totalMonthlyCommitments: 0, total: 0, perOwner: [] },
    jointFundingModel: 'split',
    jointPool: { totalIn: 0, jointCosts: 0, surplus: 0 },
    coupleSurplus: 0,
    ...overrides,
  }
}

const members = [
  { id: 'joint', kind: 'joint', displayName: 'Joint' },
  { id: 'alice', kind: 'person', displayName: 'Alice' },
  { id: 'bob', kind: 'person', displayName: 'Bob' },
]

function person(memberId: string, displayName: string, personalPotFunding: number, jointContribution: number) {
  return {
    memberId,
    displayName,
    personalPotFunding,
    jointContribution,
    setAside: personalPotFunding + jointContribution,
    periodIncome: 0,
    remainder: 0,
  }
}

function input(plan: FundingPlan, overrides: Partial<PaydaySheetInput> = {}): PaydaySheetInput {
  return {
    plan,
    members,
    categories: [{ id: 'cat-home', name: 'Home' }],
    household: { displayName: 'The Smiths', budgetPeriodStartDay: 25 },
    today: '2026-10-23',
    generatedAt: new Date(2026, 9, 23, 9, 30),
    ...overrides,
  }
}

describe('buildPaydaySheet', () => {
  it('fills the header from the household and the period containing today', () => {
    const sheet = buildPaydaySheet(input(makePlan()))

    expect(sheet.householdName).toBe('The Smiths')
    expect(sheet.period).toEqual({ start: '2026-09-25', end: '2026-10-24' })
    expect(sheet.unit).toBe('/mo')
  })

  it('follows a non-monthly cycle', () => {
    const sheet = buildPaydaySheet(
      input(makePlan(), {
        household: { displayName: 'H', budgetPeriodFrequency: 'fortnightly', budgetPeriodAnchor: '2026-10-16' },
      }),
    )

    expect(sheet.period).toEqual({ start: '2026-10-16', end: '2026-10-29' })
    expect(sheet.unit).toBe('/2 wks')
  })

  it('groups pots by owner, people first then joint, by name within a group', () => {
    const plan = makePlan({
      perPerson: [person('alice', 'Alice', 7000, 1000), person('bob', 'Bob', 0, 1000)],
      pots: [
        { potId: 'j1', name: 'Holidays', ownerId: 'joint', fundingPerPeriod: 2000 },
        { potId: 'a2', name: 'Phone', ownerId: 'alice', fundingPerPeriod: 5000 },
        { potId: 'a1', name: 'Gym', ownerId: 'alice', fundingPerPeriod: 2000 },
      ],
      jointPotFundingTotal: 2000,
    })

    const sheet = buildPaydaySheet(input(plan))

    expect(sheet.potGroups).toEqual([
      {
        ownerName: 'Alice',
        pots: [
          { name: 'Gym', amount: 2000 },
          { name: 'Phone', amount: 5000 },
        ],
        total: 7000,
      },
      { ownerName: 'Joint', pots: [{ name: 'Holidays', amount: 2000 }], total: 2000 },
    ])
    expect(sheet.people).toEqual([
      { name: 'Alice', personalPots: 7000, jointContribution: 1000, setAside: 8000 },
      { name: 'Bob', personalPots: 0, jointContribution: 1000, setAside: 1000 },
    ])
    expect(sheet.jointPotsTotal).toBe(2000)
  })

  it('drops pots with nothing to move and keeps pots of an owner no longer listed', () => {
    const plan = makePlan({
      pots: [
        { potId: 'a1', name: 'Dormant', ownerId: 'alice', fundingPerPeriod: 0 },
        { potId: 'x1', name: 'Old', ownerId: 'gone', fundingPerPeriod: 300 },
      ],
    })

    const sheet = buildPaydaySheet(input(plan))

    expect(sheet.potGroups).toEqual([{ ownerName: 'Former member', pots: [{ name: 'Old', amount: 300 }], total: 300 }])
  })

  it('shows the joint pool only under pooled funding', () => {
    const jointPool = { totalIn: 50000, jointCosts: 42000, surplus: 8000 }

    expect(buildPaydaySheet(input(makePlan({ jointPool }))).jointPool).toBeNull()
    expect(buildPaydaySheet(input(makePlan({ jointPool, jointFundingModel: 'pooled' }))).jointPool).toEqual(jointPool)
  })

  it('names main-account rows by category, falling back to Uncategorised', () => {
    const plan = makePlan({
      mainAccountFundingPerPeriod: 15000,
      mainAccountByCategory: [
        { categoryId: 'cat-home', fundingPerPeriod: 12000 },
        { categoryId: null, fundingPerPeriod: 2000 },
        { categoryId: 'cat-archived', fundingPerPeriod: 1000 },
      ],
    })

    const sheet = buildPaydaySheet(input(plan))

    expect(sheet.mainAccount).toEqual({
      rows: [
        { name: 'Home', amount: 12000 },
        { name: 'Uncategorised', amount: 2000 },
        { name: 'Uncategorised', amount: 1000 },
      ],
      total: 15000,
    })
  })

  it('rounds every amount to whole minor units', () => {
    const plan = makePlan({
      perPerson: [person('alice', 'Alice', 1234.5, 99.4999)],
      pots: [{ potId: 'a1', name: 'Phone', ownerId: 'alice', fundingPerPeriod: 1234.5 }],
      jointPotFundingTotal: 0.4,
      unassignedFundingPerPeriod: 10.6,
      mainAccountFundingPerPeriod: 333.333,
      mainAccountByCategory: [{ categoryId: 'cat-home', fundingPerPeriod: 333.333 }],
    })

    const sheet = buildPaydaySheet(input(plan))

    expect(sheet.people[0]).toEqual({ name: 'Alice', personalPots: 1235, jointContribution: 99, setAside: 1334 })
    expect(sheet.potGroups[0]?.pots[0]?.amount).toBe(1235)
    expect(sheet.jointPotsTotal).toBe(0)
    expect(sheet.unassigned).toBe(11)
    expect(sheet.mainAccount).toEqual({ rows: [{ name: 'Home', amount: 333 }], total: 333 })
  })

  it('handles an empty household', () => {
    const sheet = buildPaydaySheet(input(makePlan()))

    expect(sheet.people).toEqual([])
    expect(sheet.potGroups).toEqual([])
    expect(sheet.mainAccount).toEqual({ rows: [], total: 0 })
    expect(sheet.unassigned).toBe(0)
  })
})
