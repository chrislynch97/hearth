import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { auditLog } from '../db/schema'
import { newId } from '../../shared/ids'
import { authAlertThreshold, checkAuthAnomalies, countLoginFailures } from './authAlerts'
import type { DB } from '../db/client'

const HOUR = 3_600_000

/** Insert one audit row at `at`, a failed sign-in unless told otherwise. */
async function seedEvent(db: DB, at: Date, action = 'login_failed', entityType = 'auth'): Promise<void> {
  await db.insert(auditLog).values({
    id: newId(),
    householdId: 'household',
    actorUserId: null,
    actorLabel: null,
    entityType,
    entityId: newId(),
    action,
    changes: null,
    createdAt: at,
  })
}

describe('authAlertThreshold', () => {
  it('defaults to 10', () => {
    expect(authAlertThreshold({} as NodeJS.ProcessEnv)).toBe(10)
  })

  it('reads 0 as "off"', () => {
    expect(authAlertThreshold({ HEARTH_AUTH_ALERT_THRESHOLD: '0' } as NodeJS.ProcessEnv)).toBe(0)
  })

  it('falls back to the default on junk', () => {
    expect(authAlertThreshold({ HEARTH_AUTH_ALERT_THRESHOLD: 'many' } as NodeJS.ProcessEnv)).toBe(10)
  })
})

describe('countLoginFailures', () => {
  it('counts only failed sign-ins inside the window', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()

    await seedEvent(db, new Date(now - 30 * 60_000))
    await seedEvent(db, new Date(now - 45 * 60_000))
    await seedEvent(db, new Date(now - 2 * HOUR)) // before the window
    await seedEvent(db, new Date(now - 10 * 60_000), 'login') // a success, not a failure
    await seedEvent(db, new Date(now - 10 * 60_000), 'create', 'pot') // not an auth event

    expect(await countLoginFailures(db, new Date(now - HOUR), new Date(now))).toBe(2)
  })
})

describe('checkAuthAnomalies', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const env = { HEARTH_AUTH_ALERT_THRESHOLD: '3', HEARTH_ALERT_WEBHOOK: 'https://hooks.example/x' } as NodeJS.ProcessEnv

  it('stays quiet below the threshold', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    await seedEvent(db, new Date(now - 10 * 60_000))
    await seedEvent(db, new Date(now - 20 * 60_000))

    expect(await checkAuthAnomalies(db, new Date(now - HOUR), new Date(now), env)).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('alerts once the threshold is reached', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    for (let i = 1; i <= 3; i++) await seedEvent(db, new Date(now - i * 60_000))

    expect(await checkAuthAnomalies(db, new Date(now - HOUR), new Date(now), env)).toBe(3)
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body).toMatchObject({ event: 'auth_failures', detail: { failures: 3, threshold: 3 } })
  })

  it('does not query or alert when the threshold is 0', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = Date.now()
    for (let i = 1; i <= 20; i++) await seedEvent(db, new Date(now - i * 60_000))

    expect(
      await checkAuthAnomalies(db, new Date(now - HOUR), new Date(now), {
        HEARTH_AUTH_ALERT_THRESHOLD: '0',
      } as NodeJS.ProcessEnv),
    ).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
