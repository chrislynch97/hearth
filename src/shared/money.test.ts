import { describe, it, expect } from 'vitest'
import { toMinor, fromMinor, formatMoney, allocate, rescaleMinor } from './money'

describe('rescaleMinor', () => {
  it('is a no-op when decimal places are unchanged', () => {
    expect(rescaleMinor(1250, 2, 2)).toBe(1250)
  })
  it('scales up exactly when increasing decimal places', () => {
    // £12.50 as 2dp = 1250 → as 3dp = 12500
    expect(rescaleMinor(1250, 2, 3)).toBe(12500)
  })
  it('scales down with rounding when decreasing decimal places', () => {
    // 1250 (2dp) → 0dp: 12.5 → 13 (round half away from zero)
    expect(rescaleMinor(1250, 2, 0)).toBe(13)
    expect(rescaleMinor(-1250, 2, 0)).toBe(-13)
  })
  it('handles negative amounts when scaling up', () => {
    expect(rescaleMinor(-500, 2, 3)).toBe(-5000)
  })
})

describe('toMinor', () => {
  it('converts major units to integer minor units', () => {
    expect(toMinor(12.5, 2)).toBe(1250)
    expect(toMinor(0.1, 2)).toBe(10)
    expect(toMinor(1000, 0)).toBe(1000)
  })
  it('rounds half-up to the nearest minor unit', () => {
    expect(toMinor(1.005, 2)).toBe(101)
  })
})

describe('fromMinor', () => {
  it('converts minor units back to a major-unit number', () => {
    expect(fromMinor(1250, 2)).toBe(12.5)
    expect(fromMinor(1000, 0)).toBe(1000)
  })
})

describe('formatMoney', () => {
  it('formats minor units with symbol and decimals', () => {
    expect(formatMoney(1250, { symbol: '£', decimalPlaces: 2, locale: 'en-GB' })).toBe('£12.50')
  })
  it('formats negative amounts', () => {
    expect(formatMoney(-500, { symbol: '£', decimalPlaces: 2, locale: 'en-GB' })).toBe('-£5.00')
  })
  it('groups thousands with commas', () => {
    expect(formatMoney(123456789, { symbol: '£', decimalPlaces: 2, locale: 'en-GB' })).toBe('£1,234,567.89')
    expect(formatMoney(-123456, { symbol: '£', decimalPlaces: 2, locale: 'en-GB' })).toBe('-£1,234.56')
    expect(formatMoney(100000, { symbol: '£', decimalPlaces: 0, locale: 'en-GB' })).toBe('£100,000')
  })

  it('places the symbol after the number (with a non-breaking space) when suffixed', () => {
    expect(
      formatMoney(123456, { symbol: '€', decimalPlaces: 2, symbolPosition: 'suffix' }),
    ).toBe('1,234.56 €')
  })

  it('honours custom group and decimal separators (German shape)', () => {
    expect(
      formatMoney(1234567, {
        symbol: '€',
        decimalPlaces: 2,
        symbolPosition: 'suffix',
        groupSeparator: '.',
        decimalSeparator: ',',
      }),
    ).toBe('12.345,67 €')
  })

  it('supports a space group separator and no separator', () => {
    expect(
      formatMoney(123456, { symbol: '', decimalPlaces: 2, groupSeparator: ' ', decimalSeparator: ',' }),
    ).toBe('1 234,56')
    expect(
      formatMoney(123456, { symbol: '$', decimalPlaces: 2, groupSeparator: '' }),
    ).toBe('$1234.56')
  })

  it('keeps the minus sign leading regardless of symbol position', () => {
    expect(
      formatMoney(-500, { symbol: 'kr', decimalPlaces: 2, symbolPosition: 'suffix' }),
    ).toBe('-5.00 kr')
  })
})

describe('allocate', () => {
  it('splits a total by weights with largest-remainder, summing exactly', () => {
    const parts = allocate(1000, [1, 1, 1])
    expect(parts).toEqual([334, 333, 333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000)
  })
  it('splits proportionally by weight', () => {
    expect(allocate(1000, [3, 1])).toEqual([750, 250])
  })
  it('returns zeros when total is zero', () => {
    expect(allocate(0, [1, 1])).toEqual([0, 0])
  })
})

describe('toMinor (negatives)', () => {
  it('rounds ties away from zero for negative amounts', () => {
    expect(toMinor(-1.005, 2)).toBe(-101)
    expect(toMinor(-12.5, 2)).toBe(-1250)
  })
  it('never returns negative zero', () => {
    expect(Object.is(toMinor(-0.004, 2), -0)).toBe(false)
    expect(toMinor(-0.004, 2)).toBe(0)
  })
})

describe('allocate (negatives)', () => {
  it('splits a negative total exactly, mirroring the positive case', () => {
    const parts = allocate(-1000, [1, 1, 1])
    expect(parts).toEqual([-334, -333, -333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000)
  })
  it('splits a negative total proportionally', () => {
    expect(allocate(-1000, [3, 1])).toEqual([-750, -250])
  })
})
