import { describe, it, expect } from 'vitest'
import {
  annualise,
  normaliseToMonthly,
  normaliseToPeriod,
  monthlyToPeriod,
  roundMinor,
  fundingPerMonth,
} from './recurrence'

describe('annualise', () => {
  it('multiplies by occurrences per year', () => {
    expect(annualise(1000, 'monthly')).toBe(12000)
    expect(annualise(1000, 'quarterly')).toBe(4000)
    expect(annualise(1000, 'yearly')).toBe(1000)
  })
  it('carries the sign of the amount (a drop is negative)', () => {
    expect(annualise(-200, 'monthly')).toBe(-2400)
  })
  it('treats one_off as zero', () => {
    expect(annualise(5000, 'one_off')).toBe(0)
  })
})

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

describe('normaliseToPeriod', () => {
  it('is identical to normaliseToMonthly for a monthly period', () => {
    for (const r of ['monthly', 'quarterly', 'yearly', 'weekly', 'fortnightly', 'one_off'] as const) {
      expect(normaliseToPeriod(12345, r, 'monthly')).toBe(normaliseToMonthly(12345, r))
    }
  })
  it('normalises a monthly bill onto shorter periods (annual ÷ periods-per-year)', () => {
    // £120/mo = £1440/yr. Weekly: ÷52; fortnightly: ÷26; four-weekly: ÷13.
    expect(normaliseToPeriod(12000, 'monthly', 'weekly')).toBeCloseTo((12000 * 12) / 52, 4)
    expect(normaliseToPeriod(12000, 'monthly', 'fortnightly')).toBeCloseTo((12000 * 12) / 26, 4)
    expect(normaliseToPeriod(12000, 'monthly', 'four_weekly')).toBeCloseTo((12000 * 12) / 13, 4)
  })
  it('a weekly bill costs its full amount each weekly period', () => {
    expect(normaliseToPeriod(2500, 'weekly', 'weekly')).toBe(2500)
  })
  it('a fortnightly bill is half its amount per weekly period', () => {
    expect(normaliseToPeriod(2000, 'fortnightly', 'weekly')).toBeCloseTo(1000, 4)
  })
  it('treats one_off as zero for any period', () => {
    expect(normaliseToPeriod(9999, 'one_off', 'four_weekly')).toBe(0)
  })
})

describe('monthlyToPeriod', () => {
  it('is a no-op for a monthly period', () => {
    expect(monthlyToPeriod(250000, 'monthly')).toBe(250000)
  })
  it('re-bases a monthly income onto shorter periods', () => {
    // £2500/mo of income = £30000/yr. Four-weekly = ÷13, weekly = ÷52.
    expect(monthlyToPeriod(250000, 'four_weekly')).toBeCloseTo((250000 * 12) / 13, 4)
    expect(monthlyToPeriod(250000, 'weekly')).toBeCloseTo((250000 * 12) / 52, 4)
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

describe('roundMinor (negatives)', () => {
  it('rounds ties away from zero', () => {
    expect(roundMinor(-4583.5)).toBe(-4584)
    expect(roundMinor(-4583.4)).toBe(-4583)
  })
})
