import { describe, it, expect } from 'vitest'
import { allocatedBudget, budgetCovering, giftTotals } from './gifts'

describe('budgetCovering', () => {
  it('raises the occasion budget to the people total when they go past it', () => {
    expect(budgetCovering(30000, 32000)).toBe(32000)
  })

  it('leaves it alone at or under the total, or with no occasion budget', () => {
    expect(budgetCovering(30000, 30000)).toBe(30000)
    expect(budgetCovering(30000, 1000)).toBe(30000)
    expect(budgetCovering(null, 50000)).toBeNull()
  })

  it('adds up only the people who have a budget', () => {
    expect(allocatedBudget([{ budget: 8000 }, { budget: null }, { budget: 2000 }])).toBe(10000)
  })
})

describe('giftTotals', () => {
  it('counts bought and given as spent, ideas as planned', () => {
    const totals = giftTotals(10000, [
      { amount: 2000, status: 'bought' },
      { amount: 1500, status: 'given' },
      { amount: 4000, status: 'idea' },
    ])
    expect(totals).toEqual({ budget: 10000, spent: 3500, planned: 4000, left: 6500 })
  })

  it('goes negative when over budget', () => {
    expect(giftTotals(1000, [{ amount: 2500, status: 'bought' }]).left).toBe(-1500)
  })

  it('has nothing left to report without a budget', () => {
    expect(giftTotals(null, [{ amount: 2500, status: 'bought' }])).toEqual({
      budget: null,
      spent: 2500,
      planned: 0,
      left: null,
    })
  })
})
