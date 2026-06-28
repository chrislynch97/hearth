import { describe, it, expect } from 'vitest'
import { findCurrency, CURRENCIES } from './currencies'

describe('findCurrency', () => {
  it('returns the preset for a known currency code', () => {
    const result = findCurrency('GBP')
    expect(result).toBeDefined()
    expect(result?.code).toBe('GBP')
    expect(result?.symbol).toBe('£')
    expect(result?.decimalPlaces).toBe(2)
  })

  it('returns undefined for an unknown currency code', () => {
    const result = findCurrency('XYZ')
    expect(result).toBeUndefined()
  })

  it('returns the correct preset for JPY (0 decimal places)', () => {
    const result = findCurrency('JPY')
    expect(result?.decimalPlaces).toBe(0)
  })

  it('finds every currency in the CURRENCIES list', () => {
    for (const preset of CURRENCIES) {
      expect(findCurrency(preset.code)).toBe(preset)
    }
  })
})
