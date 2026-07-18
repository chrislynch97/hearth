import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isUpdatePending,
  isUpdaterOnline,
  readUpdateResult,
  requestUpdate,
  updateDir,
} from './updater'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hearth-upd-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({ HEARTH_UPDATE_DIR: dir, ...over })

describe('updateDir', () => {
  it('honours HEARTH_UPDATE_DIR', () => {
    expect(updateDir({ HEARTH_UPDATE_DIR: '/srv/hearth/updates' })).toBe('/srv/hearth/updates')
  })

  it('derives from the PGlite data dir otherwise', () => {
    expect(updateDir({ DATABASE_URL: 'pglite:/data/pgdata' })).toBe(join('/data', 'updates'))
    expect(updateDir({})).toBe(join('./data', 'updates'))
  })
})

describe('request / result round-trip', () => {
  it('writes a pending request the app can see, and reads back a result', () => {
    expect(isUpdatePending(env())).toBe(false)
    requestUpdate('v1.2.0', env())
    expect(isUpdatePending(env())).toBe(true)

    // Simulate the host updater writing its outcome.
    writeFileSync(
      join(dir, 'update-result.json'),
      JSON.stringify({ ok: true, version: 'v1.2.0', at: Date.now() }),
    )
    expect(readUpdateResult(env())?.ok).toBe(true)
    expect(readUpdateResult(env())?.version).toBe('v1.2.0')
  })

  it('returns null for a missing or malformed result', () => {
    expect(readUpdateResult(env())).toBeNull()
    writeFileSync(join(dir, 'update-result.json'), 'not json')
    expect(readUpdateResult(env())).toBeNull()
  })
})

describe('isUpdaterOnline', () => {
  it('is false with no heartbeat', () => {
    expect(isUpdaterOnline(env())).toBe(false)
  })

  it('is true for a fresh heartbeat and false for a stale one', () => {
    const beat = join(dir, '.updater-heartbeat')
    writeFileSync(beat, '')
    expect(isUpdaterOnline(env())).toBe(true)

    const old = new Date(Date.now() - 10 * 60 * 1000) // 10 min ago
    utimesSync(beat, old, old)
    expect(isUpdaterOnline(env())).toBe(false)
  })
})
