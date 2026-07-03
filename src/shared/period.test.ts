import { describe, it, expect } from 'vitest'
import { periodForDate, shiftPeriod } from './period'

describe('periodForDate', () => {
  it('with startDay 1, a period is a calendar month', () => {
    expect(periodForDate('2026-07-03', 1)).toEqual({ start: '2026-07-01', end: '2026-07-31' })
  })

  it('a date on the start day begins a new period', () => {
    expect(periodForDate('2026-07-25', 25)).toEqual({ start: '2026-07-25', end: '2026-08-24' })
  })

  it('a date before the start day belongs to the previous month\'s period', () => {
    expect(periodForDate('2026-07-10', 25)).toEqual({ start: '2026-06-25', end: '2026-07-24' })
  })

  it('handles the year boundary', () => {
    expect(periodForDate('2026-01-05', 25)).toEqual({ start: '2025-12-25', end: '2026-01-24' })
  })
})

describe('shiftPeriod', () => {
  it('moves to the next period', () => {
    const p = periodForDate('2026-07-10', 25) // 2026-06-25 .. 2026-07-24
    expect(shiftPeriod(p, 1, 25)).toEqual({ start: '2026-07-25', end: '2026-08-24' })
  })

  it('moves to the previous period', () => {
    const p = periodForDate('2026-07-10', 25)
    expect(shiftPeriod(p, -1, 25)).toEqual({ start: '2026-05-25', end: '2026-06-24' })
  })

  it('round-trips forward then back', () => {
    const p = periodForDate('2026-07-03', 1)
    expect(shiftPeriod(shiftPeriod(p, 3, 1), -3, 1)).toEqual(p)
  })
})
