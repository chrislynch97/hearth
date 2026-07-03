import { describe, it, expect } from 'vitest'
import { shouldBackup } from './schedule'

const DAY = 86_400_000

describe('shouldBackup', () => {
  it('never backs up when off', () => {
    expect(shouldBackup('off', null, 1000)).toBe(false)
    expect(shouldBackup('off', 0, 10 * DAY)).toBe(false)
  })

  it('backs up immediately when never backed up before', () => {
    expect(shouldBackup('daily', null, 1000)).toBe(true)
    expect(shouldBackup('weekly', null, 1000)).toBe(true)
  })

  it('daily waits ~24h between backups', () => {
    const now = 10 * DAY
    expect(shouldBackup('daily', now - DAY / 2, now)).toBe(false)
    expect(shouldBackup('daily', now - DAY, now)).toBe(true)
  })

  it('weekly waits ~7 days between backups', () => {
    const now = 30 * DAY
    expect(shouldBackup('weekly', now - 6 * DAY, now)).toBe(false)
    expect(shouldBackup('weekly', now - 7 * DAY, now)).toBe(true)
  })
})
