import { describe, it, expect } from 'vitest'
import { periodForDate, shiftPeriod, periodConfig, type PeriodConfig } from './period'

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

// Weekly / fortnightly / four-weekly cycles anchored on a reference start date.
const weekly = (frequency: PeriodConfig['frequency'], anchor: string): PeriodConfig => ({
  frequency,
  startDay: 1,
  anchor,
})

describe('periodForDate — fixed-length cycles', () => {
  it('weekly: a period is 7 days from the anchor', () => {
    expect(periodForDate('2026-07-08', weekly('weekly', '2026-07-06'))).toEqual({
      start: '2026-07-06',
      end: '2026-07-12',
    })
  })

  it('weekly: the day after the end rolls into the next period', () => {
    expect(periodForDate('2026-07-13', weekly('weekly', '2026-07-06'))).toEqual({
      start: '2026-07-13',
      end: '2026-07-19',
    })
  })

  it('fortnightly: a period spans 14 days', () => {
    expect(periodForDate('2026-07-20', weekly('fortnightly', '2026-07-06'))).toEqual({
      start: '2026-07-20',
      end: '2026-08-02',
    })
  })

  it('four-weekly: a period spans 28 days and crosses month ends', () => {
    expect(periodForDate('2026-07-06', weekly('four_weekly', '2026-07-06'))).toEqual({
      start: '2026-07-06',
      end: '2026-08-02',
    })
  })

  it('dates before the anchor fall in an earlier period', () => {
    expect(periodForDate('2026-07-05', weekly('weekly', '2026-07-06'))).toEqual({
      start: '2026-06-29',
      end: '2026-07-05',
    })
  })
})

describe('shiftPeriod — fixed-length cycles', () => {
  it('fortnightly: moves by 14 days', () => {
    const p = periodForDate('2026-07-06', weekly('fortnightly', '2026-07-06'))
    expect(shiftPeriod(p, 1, weekly('fortnightly', '2026-07-06'))).toEqual({
      start: '2026-07-20',
      end: '2026-08-02',
    })
    expect(shiftPeriod(p, -1, weekly('fortnightly', '2026-07-06'))).toEqual({
      start: '2026-06-22',
      end: '2026-07-05',
    })
  })
})

describe('periodConfig', () => {
  it('a bare number is treated as a monthly start day', () => {
    expect(periodConfig(25)).toEqual({ frequency: 'monthly', startDay: 25, anchor: '' })
  })

  it('falls back to monthly when a non-monthly frequency has no anchor', () => {
    expect(periodConfig({ budgetPeriodFrequency: 'weekly', budgetPeriodStartDay: 3 })).toEqual({
      frequency: 'monthly',
      startDay: 3,
      anchor: '',
    })
  })

  it('keeps a non-monthly frequency when an anchor is present', () => {
    expect(
      periodConfig({ budgetPeriodFrequency: 'weekly', budgetPeriodAnchor: '2026-07-06' }),
    ).toEqual({ frequency: 'weekly', startDay: 1, anchor: '2026-07-06' })
  })
})
