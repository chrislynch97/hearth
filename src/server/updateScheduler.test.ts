import { describe, it, expect } from 'vitest'
import { isScheduledNow, localDate } from './updateScheduler'

describe('isScheduledNow', () => {
  it('null time means apply as soon as detected (always in-window)', () => {
    expect(isScheduledNow(null, new Date('2026-07-18T14:37:00'))).toBe(true)
  })

  it('matches only the configured hour', () => {
    expect(isScheduledNow('03:00', new Date('2026-07-18T03:05:00'))).toBe(true)
    expect(isScheduledNow('03:30', new Date('2026-07-18T03:59:00'))).toBe(true)
    expect(isScheduledNow('03:00', new Date('2026-07-18T04:00:00'))).toBe(false)
    expect(isScheduledNow('03:00', new Date('2026-07-18T02:59:00'))).toBe(false)
  })

  it('rejects an unparseable time rather than firing every hour', () => {
    expect(isScheduledNow('xx:yy', new Date('2026-07-18T03:00:00'))).toBe(false)
  })
})

describe('localDate', () => {
  it('formats a local YYYY-MM-DD with zero padding', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
