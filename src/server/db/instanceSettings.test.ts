import { describe, it, expect } from 'vitest'
import { makeTestDb } from './testdb'
import { getInstanceSettings, setUpdateSettings, setUpdateLastAppliedDate } from './instanceSettings'

describe('update settings', () => {
  it('defaults: auto-poll + pre-update backup on, auto-update off', async () => {
    const db = await makeTestDb()
    const s = await getInstanceSettings(db)
    expect(s.autoPoll).toBe(true)
    expect(s.preUpdateBackup).toBe(true)
    expect(s.autoUpdate).toBe(false)
    expect(s.autoUpdateTime).toBeNull()
    expect(s.updateLastAppliedDate).toBeNull()
  })

  it('persists a preferences round-trip via the singleton upsert', async () => {
    const db = await makeTestDb()
    await setUpdateSettings(db, {
      autoPoll: false,
      preUpdateBackup: false,
      autoUpdate: true,
      autoUpdateTime: '03:30',
    })
    const s = await getInstanceSettings(db)
    expect(s.autoPoll).toBe(false)
    expect(s.preUpdateBackup).toBe(false)
    expect(s.autoUpdate).toBe(true)
    expect(s.autoUpdateTime).toBe('03:30')
  })

  it('a partial patch leaves other fields untouched', async () => {
    const db = await makeTestDb()
    await setUpdateSettings(db, { autoUpdate: true, autoUpdateTime: '02:00' })
    await setUpdateSettings(db, { autoPoll: false })
    const s = await getInstanceSettings(db)
    expect(s.autoPoll).toBe(false)
    expect(s.autoUpdate).toBe(true)
    expect(s.autoUpdateTime).toBe('02:00')
  })

  it('clears the daily time back to null', async () => {
    const db = await makeTestDb()
    await setUpdateSettings(db, { autoUpdateTime: '04:00' })
    await setUpdateSettings(db, { autoUpdateTime: null })
    expect((await getInstanceSettings(db)).autoUpdateTime).toBeNull()
  })

  it('stamps the last-applied date (once-per-day guard)', async () => {
    const db = await makeTestDb()
    await setUpdateLastAppliedDate(db, '2026-07-18')
    expect((await getInstanceSettings(db)).updateLastAppliedDate).toBe('2026-07-18')
  })
})
