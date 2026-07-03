import { describe, it, expect } from 'vitest'
import { subtractMonths } from './dates'

describe('subtractMonths', () => {
  it('subtracts whole months within a year', () => {
    expect(subtractMonths('2026-06-15', 3)).toBe('2026-03-15')
  })

  it('crosses a year boundary', () => {
    expect(subtractMonths('2026-02-10', 12)).toBe('2025-02-10')
  })

  it('crosses multiple years', () => {
    expect(subtractMonths('2026-01-05', 25)).toBe('2023-12-05')
  })

  it('clamps the day to the end of a shorter target month', () => {
    // 31 May − 3 months = Feb, which has no 31st → clamp to 28 (2026 not a leap year)
    expect(subtractMonths('2026-05-31', 3)).toBe('2026-02-28')
  })

  it('clamps to 29 Feb in a leap year', () => {
    expect(subtractMonths('2024-03-31', 1)).toBe('2024-02-29')
  })

  it('handles zero months', () => {
    expect(subtractMonths('2026-07-03', 0)).toBe('2026-07-03')
  })
})
