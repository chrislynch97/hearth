import { describe, it, expect } from 'vitest'
import { formatDate, formatMonthYear } from './dateFormat'

describe('formatDate', () => {
  it('returns the raw ISO string for iso format', () => {
    expect(formatDate('2026-07-04', { locale: 'en-GB', dateFormat: 'iso' })).toBe('2026-07-04')
  })
  it('formats numeric in locale order (en-GB → day/month/year)', () => {
    expect(formatDate('2026-07-04', { locale: 'en-GB', dateFormat: 'numeric' })).toBe('04/07/2026')
  })
  it('formats medium with an abbreviated month', () => {
    expect(formatDate('2026-07-04', { locale: 'en-GB', dateFormat: 'medium' })).toBe('4 Jul 2026')
  })
  it('formats long with a full month', () => {
    expect(formatDate('2026-07-04', { locale: 'en-GB', dateFormat: 'long' })).toBe('4 July 2026')
  })
  it('does not shift the day across timezones', () => {
    // A date that would roll back a day if parsed as UTC midnight in negative offsets.
    expect(formatDate('2026-01-01', { locale: 'en-GB', dateFormat: 'numeric' })).toBe('01/01/2026')
  })
  it('falls back to the raw string for malformed input', () => {
    expect(formatDate('not-a-date', { locale: 'en-GB', dateFormat: 'medium' })).toBe('not-a-date')
    expect(formatDate('', { locale: 'en-GB', dateFormat: 'medium' })).toBe('')
  })
})

describe('formatMonthYear', () => {
  it('names the month the date falls in', () => {
    expect(formatMonthYear('2026-07-25', 'en-GB')).toBe('July 2026')
  })
  it('does not roll into the previous month across timezones', () => {
    expect(formatMonthYear('2026-01-01', 'en-GB')).toBe('January 2026')
  })
  it('follows the locale', () => {
    expect(formatMonthYear('2026-07-25', 'fr-FR')).toBe('juillet 2026')
  })
  it('is empty for malformed input', () => {
    expect(formatMonthYear('not-a-date', 'en-GB')).toBe('')
    expect(formatMonthYear('', 'en-GB')).toBe('')
  })
})
