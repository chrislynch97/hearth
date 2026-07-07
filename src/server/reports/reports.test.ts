import { describe, it, expect } from 'vitest'
import {
  categoryBreakdown,
  monthlyTotals,
  monthOverMonth,
  perMemberVsJoint,
  spendCategory,
  spendVsAllocation,
} from './reports'

const potCategory = new Map<string, string | null>([
  ['pot-bills', 'bills'],
  ['pot-fun', 'fun'],
  ['pot-uncat', null],
])
const categories = [
  { id: 'bills', name: 'Bills' },
  { id: 'fun', name: 'Fun' },
]

describe('spendCategory', () => {
  it('uses the pot\'s category when a pot is assigned', () => {
    expect(spendCategory({ potId: 'pot-bills', categoryId: null }, potCategory)).toBe('bills')
  })
  it('falls back to the spend\'s own category when there is no pot', () => {
    expect(spendCategory({ potId: null, categoryId: 'fun' }, potCategory)).toBe('fun')
  })
})

describe('categoryBreakdown', () => {
  it('sums spend per category, sorted by spend desc, with a total', () => {
    const result = categoryBreakdown({
      spends: [
        { potId: 'pot-bills', categoryId: null, amount: 5000 },
        { potId: 'pot-bills', categoryId: null, amount: 3000 },
        { potId: 'pot-fun', categoryId: null, amount: 10000 },
        { potId: null, categoryId: null, amount: 1000 }, // uncategorised
      ],
      potCategory,
      categories,
    })
    expect(result.total).toBe(19000)
    expect(result.rows).toEqual([
      { categoryId: 'fun', name: 'Fun', spent: 10000 },
      { categoryId: 'bills', name: 'Bills', spent: 8000 },
      { categoryId: null, name: 'Uncategorised', spent: 1000 },
    ])
  })
})

describe('spendVsAllocation', () => {
  it('joins planned funding with actual spend per category', () => {
    const rows = spendVsAllocation({
      allocation: [
        { categoryId: 'bills', name: 'Bills', funding: 10000 },
        { categoryId: 'fun', name: 'Fun', funding: 5000 },
      ],
      breakdown: [
        { categoryId: 'bills', name: 'Bills', spent: 8000 },
        { categoryId: 'savings', name: 'Savings', spent: 2000 }, // spent but not funded
      ],
    })
    const bills = rows.find((r) => r.categoryId === 'bills')!
    expect(bills).toEqual({ categoryId: 'bills', name: 'Bills', planned: 10000, actual: 8000, diff: 2000 })
    // Funded-but-unspent still appears.
    expect(rows.find((r) => r.categoryId === 'fun')).toEqual({ categoryId: 'fun', name: 'Fun', planned: 5000, actual: 0, diff: 5000 })
    // Spent-but-unfunded appears with planned 0.
    expect(rows.find((r) => r.categoryId === 'savings')).toEqual({ categoryId: 'savings', name: 'Savings', planned: 0, actual: 2000, diff: -2000 })
  })
})

describe('perMemberVsJoint', () => {
  it('sums each owner\'s monthly outgoing cost from attributed costs (fairness lens)', () => {
    const rows = perMemberVsJoint({
      members: [
        { id: 'alice', displayName: 'Alice', kind: 'person' },
        { id: 'bob', displayName: 'Bob', kind: 'person' },
        { id: 'joint', displayName: 'Joint', kind: 'joint' },
      ],
      costs: [
        { recurrence: 'monthly', amount: 5000, ownerId: 'alice' },
        { recurrence: 'monthly', amount: 3000, ownerId: 'joint' },
        { recurrence: 'yearly', amount: 12000, ownerId: 'bob' }, // 1000/mo
      ],
    })
    expect(rows.find((r) => r.ownerId === 'alice')?.monthlyCost).toBe(5000)
    expect(rows.find((r) => r.ownerId === 'bob')?.monthlyCost).toBe(1000)
    expect(rows.find((r) => r.ownerId === 'joint')?.monthlyCost).toBe(3000)
  })
})

describe('monthlyTotals', () => {
  it('totals spend and counts per month, with change vs the prior month and avg/high/low', () => {
    const result = monthlyTotals({
      spends: [
        { date: '2026-05-10', amount: 100 },
        { date: '2026-07-01', amount: 200 },
        { date: '2026-07-02', amount: 50 },
      ],
      asOf: '2026-07-03',
      months: 3,
    })
    expect(result.rows).toEqual([
      { month: '2026-05', total: 100, count: 1, change: null },
      { month: '2026-06', total: 0, count: 0, change: -100 },
      { month: '2026-07', total: 250, count: 2, change: 250 },
    ])
    expect(result.average).toBe(117) // round((100 + 0 + 250) / 3)
    // Empty months are excluded from the high/low ranking.
    expect(result.highest?.month).toBe('2026-07')
    expect(result.lowest?.month).toBe('2026-05')
  })

  it('reports no high/low when there is no spend in the window', () => {
    const result = monthlyTotals({ spends: [], asOf: '2026-07-03', months: 3 })
    expect(result.average).toBe(0)
    expect(result.highest).toBeNull()
    expect(result.lowest).toBeNull()
  })
})

describe('monthOverMonth', () => {
  it('builds a category-by-month matrix over the trailing months', () => {
    const result = monthOverMonth({
      spends: [
        { date: '2026-05-10', potId: 'pot-bills', categoryId: null, amount: 100 },
        { date: '2026-07-01', potId: 'pot-bills', categoryId: null, amount: 200 },
        { date: '2026-07-02', potId: 'pot-fun', categoryId: null, amount: 50 },
      ],
      potCategory,
      categories,
      asOf: '2026-07-03',
      months: 3,
    })
    expect(result.months).toEqual(['2026-05', '2026-06', '2026-07'])
    const bills = result.rows.find((r) => r.categoryId === 'bills')!
    expect(bills.byMonth).toEqual([100, 0, 200])
    const fun = result.rows.find((r) => r.categoryId === 'fun')!
    expect(fun.byMonth).toEqual([0, 0, 50])
  })
})
