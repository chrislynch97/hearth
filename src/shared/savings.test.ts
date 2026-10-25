import { describe, it, expect } from 'vitest'
import type { PeriodConfig } from './period'
import {
  savingsPlan,
  outcomeFor,
  neededPerPeriod,
  projection,
  neededSteps,
  planLines,
  monthlySetAsideFor,
  goalPath,
  shortIdOf,
  type SavingsPlanInput,
  type SavingsPlanItem,
} from './savings'

const monthly25: PeriodConfig = { frequency: 'monthly', startDay: 25, anchor: '' }
const fourWeekly: PeriodConfig = { frequency: 'four_weekly', startDay: 1, anchor: '2026-10-02' }

const item = (id: string, amount: number, dueDate: string | null, paidOn: string | null = null): SavingsPlanItem => ({
  id,
  name: id,
  amount,
  dueDate,
  paidOn,
})

// The sample wedding: £28,000 by 12 Jun 2028 (the paid venue deposit already
// taken off), £11,500 recorded on 20 Oct, paydays on the 25th.
const wedding = (contribution: number): SavingsPlanInput => ({
  targetAmount: 2_800_000,
  targetDate: '2028-06-12',
  items: [
    item('venue-deposit', 200_000, '2026-09-15', '2026-09-10'),
    item('photographer-deposit', 60_000, '2026-11-30'),
    item('dress', 220_000, '2028-02-01'),
    item('venue-balance', 800_000, '2028-03-12'),
    item('rings', 180_000, '2028-04-01'),
    item('catering', 750_000, '2028-05-29'),
    item('cake', 50_000, '2028-05-29'),
    item('photographer-balance', 200_000, null),
  ],
  balances: [
    { asOfDate: '2026-09-25', amount: 750_000 },
    { asOfDate: '2026-10-20', amount: 1_150_000 },
  ],
  contribution,
  today: '2026-10-24',
  period: monthly25,
})

describe('savingsPlan — the sample wedding', () => {
  it('is over at £900/mo and says the lowest that still hits', () => {
    const plan = savingsPlan(wedding(90_000))
    expect(plan.balanceNow).toBe(1_150_000)
    expect(plan.outcome.final).toBe(2_950_000)
    expect(plan.outcome.difference).toBe(150_000)
    expect(plan.outcome.short).toEqual([])
    expect(plan.neededPerPeriod).toBe(82_500)
    expect(plan.flags).toEqual({})
  })

  it('reaches the target on the first payday the projection crosses it', () => {
    // £16,500 to go at £900 = 18.3 paydays → the 19th, 25 Apr 2028.
    expect(outcomeFor(wedding(90_000), 90_000).reachedOn).toBe('2028-04-25')
  })

  it('at £600/mo names the lines that fall short', () => {
    const outcome = outcomeFor(wedding(60_000), 60_000)
    expect(outcome.difference).toBe(-450_000)
    expect(outcome.reachedOn).toBeNull()
    expect(outcome.short.map((line) => line.itemId)).toEqual(['photographer-balance', null])
  })

  it('puts the unitemised remainder of the target on the goal date', () => {
    const headroom = planLines(wedding(0)).find((line) => line.itemId === null)
    expect(headroom).toEqual({ itemId: null, name: 'Not itemised yet', amount: 540_000, due: '2028-06-12' })
  })
})

describe('neededPerPeriod', () => {
  it('counts paydays before a deadline, not weeks: the four-weekly cake', () => {
    const cake = (dueDate: string): SavingsPlanInput => ({
      targetAmount: 30_000,
      targetDate: dueDate,
      items: [item('cake', 30_000, dueDate)],
      balances: [],
      contribution: 0,
      today: '2026-10-24',
      period: fourWeekly,
    })
    // Paydays 30 Oct and 27 Nov.
    expect(neededPerPeriod(cake('2026-12-05'))).toBe(15_000)
    expect(neededPerPeriod(cake('2026-11-26'))).toBe(30_000)
  })

  it('lets the tightest deadline drive the figure', () => {
    const input: SavingsPlanInput = {
      targetAmount: 1_000_000,
      targetDate: '2027-10-25',
      items: [item('deposit', 300_000, '2026-12-01')],
      balances: [],
      contribution: 0,
      today: '2026-10-24',
      period: monthly25,
    }
    // £3,000 over two paydays beats £10,000 over thirteen.
    expect(neededPerPeriod(input)).toBe(150_000)
  })

  it('is zero once the pot already holds the target', () => {
    const input = { ...wedding(90_000), balances: [{ asOfDate: '2026-10-20', amount: 3_000_000 }] }
    expect(neededPerPeriod(input)).toBe(0)
    expect(outcomeFor(input, 90_000).reachedOn).toBe('2026-10-24')
  })

  it('leaves out a line no payday can reach, and flags it instead', () => {
    const input: SavingsPlanInput = {
      targetAmount: 100_000,
      targetDate: '2027-04-25',
      items: [item('late', 40_000, '2026-10-01'), item('tomorrow', 20_000, '2026-10-25'), item('later', 40_000, '2027-04-25')],
      balances: [{ asOfDate: '2026-10-01', amount: 10_000 }],
      contribution: 5_000,
      today: '2026-10-24',
      period: { frequency: 'monthly', startDay: 1, anchor: '' },
    }
    const plan = savingsPlan(input)
    expect(plan.flags).toEqual({
      late: { kind: 'overdue', shortBy: 30_000 },
      tomorrow: { kind: 'at_risk', shortBy: 50_000 },
    })
    // No payday since the 1 Oct balance; the £90,000 gap to the last deadline spreads over six paydays.
    expect(plan.balanceNow).toBe(10_000)
    expect(plan.neededPerPeriod).toBe(15_000)
  })
})

describe('outcomeFor — what the goal date needs', () => {
  const overItemised = (contribution: number): SavingsPlanInput => ({
    targetAmount: 100_000,
    targetDate: '2027-04-25',
    items: [item('early', 60_000, '2026-11-25'), item('late', 70_000, null)],
    balances: [{ asOfDate: '2026-10-20', amount: 10_000 }],
    contribution,
    today: '2026-10-24',
    period: monthly25,
  })

  it('measures against the unpaid items when they cost more than the target', () => {
    // £100 + seven paydays (25 Oct to 25 Apr) at £300 = £2,200, against £1,300 of items.
    const outcome = outcomeFor(overItemised(30_000), 30_000)
    expect(outcome.required).toBe(130_000)
    expect(outcome.difference).toBe(220_000 - 130_000)
  })

  it('can be short on an early item while still over on the day', () => {
    // At £200: £500 by 25 Nov misses the £600 due then, but £1,500 by April clears £1,300.
    const outcome = outcomeFor(overItemised(20_000), 20_000)
    expect(outcome.short.map((line) => line.itemId)).toEqual(['early'])
    expect(outcome.difference).toBe(20_000)
  })

  it('marks a short line with no payday left as stranded', () => {
    const input: SavingsPlanInput = {
      targetAmount: 120_000,
      targetDate: '2027-04-25',
      items: [item('fence', 80_000, '2026-10-24'), item('paving', 40_000, null)],
      balances: [{ asOfDate: '2026-10-24', amount: 30_000 }],
      contribution: 0,
      today: '2026-10-24',
      period: monthly25,
    }
    const outcome = outcomeFor(input, neededPerPeriod(input))
    expect(outcome.stranded.map((line) => line.itemId)).toEqual(['fence'])
    // The figure covers everything a payday can still reach.
    expect(outcome.short.map((line) => line.itemId)).toEqual(['fence'])
  })
})

describe('balanceNow', () => {
  it('adds paydays since the last balance and takes off items paid since', () => {
    const input: SavingsPlanInput = {
      ...wedding(90_000),
      today: '2026-12-01',
      items: [...wedding(0).items.slice(0, 1), item('photographer-deposit', 60_000, '2026-11-30', '2026-11-28')],
    }
    // £11,500 + paydays 25 Oct and 25 Nov − the £600 deposit; the venue deposit predates the balance.
    expect(savingsPlan(input).balanceNow).toBe(1_150_000 + 180_000 - 60_000)
  })

  it('is zero with no balance recorded, whatever the contribution', () => {
    expect(savingsPlan({ ...wedding(90_000), balances: [] }).balanceNow).toBe(0)
  })

  it('ignores a balance dated after today', () => {
    const input = { ...wedding(90_000), balances: [...wedding(0).balances, { asOfDate: '2026-11-01', amount: 9_999_999 }] }
    expect(savingsPlan(input).balanceNow).toBe(1_150_000)
  })
})

describe('projection and neededSteps', () => {
  it('projects one point per payday, running on to the goal date', () => {
    const points = projection(wedding(90_000), 90_000)
    expect(points[0]).toEqual({ date: '2026-10-24', amount: 1_150_000 })
    expect(points[1]).toEqual({ date: '2026-10-25', amount: 1_240_000 })
    expect(points).toHaveLength(22)
    expect(points.at(-2)).toEqual({ date: '2028-05-25', amount: 2_950_000 })
    expect(points.at(-1)).toEqual({ date: '2028-06-12', amount: 2_950_000 })
  })

  it('steps up at each later deadline and ends at the target', () => {
    const steps = neededSteps(wedding(0))
    expect(steps[0]).toEqual({ date: '2026-10-24', amount: 0 })
    expect(steps.map((s) => s.date)).toEqual(['2026-10-24', '2026-11-30', '2028-02-01', '2028-03-12', '2028-04-01', '2028-05-29', '2028-06-12'])
    expect(steps.at(-1)?.amount).toBe(2_800_000)
  })
})

describe('monthlySetAsideFor', () => {
  it('is the same figure on a monthly cycle', () => {
    expect(monthlySetAsideFor(82_500, monthly25)).toBe(82_500)
  })

  it('converts a shorter cycle up to a whole monthly amount', () => {
    expect(monthlySetAsideFor(90_000, fourWeekly)).toBe(97_500)
    expect(monthlySetAsideFor(10_000, { frequency: 'weekly', startDay: 1, anchor: '2026-10-05' })).toBe(43_334)
  })
})

describe('goalPath and shortIdOf', () => {
  it('puts the fixed short id in front of a readable slug', () => {
    expect(goalPath('k3x9p2', 'Our Wedding!')).toBe('k3x9p2-our-wedding')
    expect(goalPath('k3x9p2', '£££')).toBe('k3x9p2')
  })

  it('reads the short id back, whatever the slug says', () => {
    expect(shortIdOf('k3x9p2-our-wedding')).toBe('k3x9p2')
    expect(shortIdOf('k3x9p2-an-old-name')).toBe('k3x9p2')
    expect(shortIdOf('k3x9p2')).toBe('k3x9p2')
  })

  it('finds no short id in an old-style or malformed segment', () => {
    expect(shortIdOf('wedding')).toBeNull()
    expect(shortIdOf('k3x9p2x-wedding')).toBeNull()
    expect(shortIdOf('K3X9P2-wedding')).toBeNull()
  })
})
