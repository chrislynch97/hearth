import { describe, it, expect } from 'vitest'
import { formatSignedPercent } from './useMoney'

describe('formatSignedPercent', () => {
  it('prefixes a + on positive values', () => {
    expect(formatSignedPercent(3.5)).toBe('+3.5%')
  })
  it('keeps the native minus on negatives', () => {
    expect(formatSignedPercent(-1.2)).toBe('-1.2%')
  })
  it('leaves zero unsigned', () => {
    expect(formatSignedPercent(0)).toBe('0.0%')
  })
  it('honours a custom precision', () => {
    expect(formatSignedPercent(2, 0)).toBe('+2%')
  })
})
