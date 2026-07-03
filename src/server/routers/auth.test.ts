import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import type { DB } from '../db/client'

/** A caller with a cookie spy so we can assert session cookies get set/cleared. */
function makeCaller(db: DB, sessionToken?: string) {
  const cookies: Array<string | null> = []
  const caller = appRouter.createCaller({
    db,
    sessionToken,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { caller, cookies }
}

describe('auth router', () => {
  it('reports no-auth and stays authenticated when no password is set', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = makeCaller(db)
    const status = await caller.auth.status()
    expect(status).toEqual({ passwordSet: false, authenticated: true })
  })

  it('setPassword locks the instance; wrong login is rejected, correct login sets a cookie', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const set = makeCaller(db)
    await set.caller.auth.setPassword({ newPassword: 'hunter2' })
    // Setting a password logs the setter in (cookie issued).
    expect(set.cookies.at(-1)).toBeTruthy()

    const anon = makeCaller(db)
    const status = await anon.caller.auth.status()
    expect(status.passwordSet).toBe(true)
    expect(status.authenticated).toBe(false)

    await expect(anon.caller.auth.login({ password: 'wrong' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const login = makeCaller(db)
    await login.caller.auth.login({ password: 'hunter2' })
    const issued = login.cookies.at(-1)
    expect(issued).toBeTruthy()

    // A request carrying that cookie is authenticated.
    const authed = makeCaller(db, issued as string)
    expect((await authed.caller.auth.status()).authenticated).toBe(true)
  })

  it('changing the password requires the current one and invalidates old sessions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const setup = makeCaller(db)
    await setup.caller.auth.setPassword({ newPassword: 'first' })
    const oldToken = setup.cookies.at(-1) as string

    await expect(
      setup.caller.auth.setPassword({ currentPassword: 'nope', newPassword: 'second' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    await setup.caller.auth.setPassword({ currentPassword: 'first', newPassword: 'second' })

    // The old cookie no longer authenticates.
    const withOld = makeCaller(db, oldToken)
    expect((await withOld.caller.auth.status()).authenticated).toBe(false)
  })

  it('clearPassword removes auth after verifying the current password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const c = makeCaller(db)
    await c.caller.auth.setPassword({ newPassword: 'secret' })

    await expect(c.caller.auth.clearPassword({ currentPassword: 'wrong' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    await c.caller.auth.clearPassword({ currentPassword: 'secret' })
    expect((await c.caller.auth.status()).passwordSet).toBe(false)
  })
})
