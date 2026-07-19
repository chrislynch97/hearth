import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestDb } from '../db/testdb'
import { checkHealth, dataDir, freeMbOn, healthBody, minFreeMb } from './health'

describe('dataDir', () => {
  it('watches the PGlite data dir for the embedded engine', () => {
    expect(dataDir({ DATABASE_URL: 'pglite:/data/pgdata' } as NodeJS.ProcessEnv)).toBe('/data/pgdata')
    expect(dataDir({} as NodeJS.ProcessEnv)).toBe('./data/pgdata')
  })

  it('watches ./data against a real Postgres server (backups still land there)', () => {
    expect(dataDir({ DATABASE_URL: 'postgres://u:p@h/db' } as NodeJS.ProcessEnv)).toBe('./data')
  })
})

describe('minFreeMb', () => {
  it('defaults to 512', () => {
    expect(minFreeMb({} as NodeJS.ProcessEnv)).toBe(512)
  })

  it('reads a positive integer', () => {
    expect(minFreeMb({ HEARTH_DISK_MIN_FREE_MB: '2048' } as NodeJS.ProcessEnv)).toBe(2048)
  })

  it('falls back to the default on junk rather than disabling the check', () => {
    expect(minFreeMb({ HEARTH_DISK_MIN_FREE_MB: 'lots' } as NodeJS.ProcessEnv)).toBe(512)
    expect(minFreeMb({ HEARTH_DISK_MIN_FREE_MB: '-1' } as NodeJS.ProcessEnv)).toBe(512)
  })
})

describe('freeMbOn', () => {
  it('reports free space for a path that does not exist yet (first boot)', () => {
    const missing = join(tmpdir(), 'hearth-health-test', 'not', 'created', 'yet')
    expect(freeMbOn(missing)).toBeGreaterThan(0)
  })
})

describe('checkHealth', () => {
  it('is ok when the DB answers and the disk has room', async () => {
    const db = await makeTestDb()
    const detail = await checkHealth(db, { HEARTH_DISK_MIN_FREE_MB: '1' } as NodeJS.ProcessEnv)
    expect(detail.status).toBe('ok')
    expect(detail.db.ok).toBe(true)
    expect(detail.disk.ok).toBe(true)
    expect(detail.disk.freeMb).toBeGreaterThan(0)
  })

  it('is degraded when free space is under the floor', async () => {
    const db = await makeTestDb()
    // A floor no real filesystem can clear (~1 EB), so the check must trip.
    const detail = await checkHealth(db, {
      HEARTH_DISK_MIN_FREE_MB: String(Number.MAX_SAFE_INTEGER),
    } as NodeJS.ProcessEnv)
    expect(detail.status).toBe('degraded')
    expect(detail.disk.ok).toBe(false)
  })

  it('is degraded, not thrown, when the DB is unreachable', async () => {
    const broken = {
      execute: () => Promise.reject(new Error('connection terminated')),
    } as unknown as Parameters<typeof checkHealth>[0]
    const detail = await checkHealth(broken, { HEARTH_DISK_MIN_FREE_MB: '1' } as NodeJS.ProcessEnv)
    expect(detail.status).toBe('degraded')
    expect(detail.db).toEqual({ ok: false, error: 'connection terminated' })
  })
})

describe('healthBody', () => {
  it('serves booleans only — no free-space numbers or error text', () => {
    expect(
      healthBody({
        status: 'degraded',
        db: { ok: false, error: 'connection terminated' },
        disk: { ok: true, path: '/data/pgdata', freeMb: 17, minFreeMb: 512 },
      }),
    ).toEqual({ status: 'degraded', checks: { db: { ok: false }, disk: { ok: true } } })
  })
})
