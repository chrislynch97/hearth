import { describe, it, expect } from 'vitest'
import { currentSalary, percentIncrease, prevSalary } from './raises'

// Salary history for one owner (annual salary in minor units).
const raises = [
  { id: 'r1', effectiveDate: '2022-01-01', newSalary: 4000000 }, // £40,000 baseline
  { id: 'r2', effectiveDate: '2023-04-01', newSalary: 4400000 }, // £44,000
  { id: 'r3', effectiveDate: '2024-06-01', newSalary: 4620000 }, // £46,200
]

describe('prevSalary', () => {
  it('returns the salary of the immediately preceding raise', () => {
    expect(prevSalary(raises, 'r3')).toBe(4400000)
    expect(prevSalary(raises, 'r2')).toBe(4000000)
  })

  it('returns null for the baseline raise', () => {
    expect(prevSalary(raises, 'r1')).toBeNull()
  })
})

describe('percentIncrease', () => {
  it('computes the increase vs the previous raise', () => {
    // (44000 − 40000) / 40000 × 100 = 10
    expect(percentIncrease(raises, 'r2')).toBeCloseTo(10, 5)
    // (46200 − 44000) / 44000 × 100 = 5
    expect(percentIncrease(raises, 'r3')).toBeCloseTo(5, 5)
  })

  it('returns null for the baseline (no prior salary)', () => {
    expect(percentIncrease(raises, 'r1')).toBeNull()
  })

  it('returns null when the previous salary is zero', () => {
    const withZero = [
      { id: 'a', effectiveDate: '2020-01-01', newSalary: 0 },
      { id: 'b', effectiveDate: '2021-01-01', newSalary: 3000000 },
    ]
    expect(percentIncrease(withZero, 'b')).toBeNull()
  })
})

describe('currentSalary', () => {
  it('returns the latest raise effective on or before asOf', () => {
    expect(currentSalary(raises, '2024-12-31')).toBe(4620000)
    expect(currentSalary(raises, '2023-05-01')).toBe(4400000)
    expect(currentSalary(raises, '2022-01-01')).toBe(4000000) // inclusive of the effective date
  })

  it('returns null when no raise is yet effective', () => {
    expect(currentSalary(raises, '2021-12-31')).toBeNull()
  })

  it('returns null for an empty history', () => {
    expect(currentSalary([], '2026-07-03')).toBeNull()
  })
})
