import { describe, it, expect } from 'vitest'
import { toMinor, fromMinor, formatMoney, allocate } from './money'

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
