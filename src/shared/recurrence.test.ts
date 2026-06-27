import { describe, it, expect } from 'vitest'
import { normaliseToMonthly, roundMinor, fundingPerMonth } from './recurrence'

describe('normaliseToMonthly', () => {
  it('passes monthly through unchanged', () => {
    expect(normaliseToMonthly(1000, 'monthly')).toBe(1000)
  })
  it('divides quarterly by 3 and yearly by 12 (fractional, unrounded)', () => {
    expect(normaliseToMonthly(300, 'quarterly')).toBe(100)
    expect(normaliseToMonthly(55000, 'yearly')).toBeCloseTo(4583.333, 2)
  })
  it('handles weekly and fortnightly', () => {
    expect(normaliseToMonthly(1200, 'weekly')).toBeCloseTo((1200 * 52) / 12, 4)
    expect(normaliseToMonthly(1200, 'fortnightly')).toBeCloseTo((1200 * 26) / 12, 4)
  })
  it('treats one_off as zero recurring', () => {
    expect(normaliseToMonthly(9999, 'one_off')).toBe(0)
  })
})

describe('roundMinor', () => {
  it('rounds half-up to the nearest integer minor unit', () => {
    expect(roundMinor(4583.333)).toBe(4583)
    expect(roundMinor(4583.5)).toBe(4584)
  })
})

describe('fundingPerMonth', () => {
  it('sums monthly-equivalents at full precision then rounds once', () => {
    const total = fundingPerMonth([
      { amount: 55000, recurrence: 'yearly' },
      { amount: 4500, recurrence: 'yearly' },
    ])
    expect(total).toBe(roundMinor(55000 / 12 + 4500 / 12))
    expect(total).toBe(4958)
  })
})
