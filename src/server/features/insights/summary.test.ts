import { describe, it, expect } from 'vitest'
import { allocationByCategory, monthlyNetTrend } from './summary'

describe('allocationByCategory', () => {
  it('groups pot funding by category, sorted by funding desc, with uncategorised last-resolved', () => {
    const result = allocationByCategory({
      pots: [
        { id: 'p1', categoryId: 'bills', fundingPerPeriod: 5000 },
        { id: 'p2', categoryId: 'bills', fundingPerPeriod: 3000 },
        { id: 'p3', categoryId: 'fun', fundingPerPeriod: 10000 },
        { id: 'p4', categoryId: null, fundingPerPeriod: 2000 },
        { id: 'p5', categoryId: 'bills', fundingPerPeriod: 0 }, // zero funding ignored
      ],
      categories: [
        { id: 'bills', name: 'Bills' },
        { id: 'fun', name: 'Fun' },
      ],
    })
    expect(result.total).toBe(20000)
    expect(result.perCategory).toEqual([
      { categoryId: 'fun', name: 'Fun', funding: 10000 },
      { categoryId: 'bills', name: 'Bills', funding: 8000 },
      { categoryId: null, name: 'Uncategorised', funding: 2000 },
    ])
  })

  it('is empty when nothing is funded', () => {
    const result = allocationByCategory({ pots: [{ id: 'p1', categoryId: 'x', fundingPerPeriod: 0 }], categories: [] })
    expect(result).toEqual({ perCategory: [], total: 0 })
  })
})

describe('monthlyNetTrend', () => {
  it('returns the trailing N months chronologically, summing net per month', () => {
    const slips = [
      { payDate: '2026-05-31', effectiveNet: 200000 },
      { payDate: '2026-07-31', effectiveNet: 210000 },
      { payDate: '2026-07-15', effectiveNet: 5000 }, // second July payslip → summed
    ]
    const trend = monthlyNetTrend(slips, '2026-07-03', 3)
    expect(trend).toEqual([
      { month: '2026-05', net: 200000 },
      { month: '2026-06', net: 0 },
      { month: '2026-07', net: 215000 },
    ])
  })

  it('ignores payslips outside the window', () => {
    const slips = [{ payDate: '2025-01-31', effectiveNet: 999 }]
    const trend = monthlyNetTrend(slips, '2026-07-03', 3)
    expect(trend.every((m) => m.net === 0)).toBe(true)
  })
})
