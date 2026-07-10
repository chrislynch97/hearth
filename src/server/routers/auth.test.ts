import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { generateTotp } from '../auth/totp'
import type { DB } from '../db/client'

// A password comfortably clearing the strength policy (>= 10 chars, not common).
const PW = 'correct-horse-staple'
const USER = 'owner' // the auto-provisioned owner account

/** A caller with a cookie spy so we can assert session cookies get set/cleared. */
function makeCaller(db: DB, sessionToken?: string) {
  const cookies: Array<string | null> = []
  const caller = appRouter.createCaller({
    db,
    householdId: 'household',
    role: 'owner',
    sessionToken,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { caller, cookies }
}

/** Set the owner password (from the open instance) and return an authed caller. */
async function lockAndLogin(db: DB) {
  const setup = makeCaller(db)
  await setup.caller.auth.setPassword({ newPassword: PW })
  const token = setup.cookies.at(-1) as string
  return { token, authed: makeCaller(db, token) }
}

describe('auth router', () => {
  it('reports no-auth and stays authenticated when no password is set', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = makeCaller(db)
    const status = await caller.auth.status()
    expect(status.passwordSet).toBe(false)
    expect(status.authenticated).toBe(true)
    expect(status.user?.username).toBe(USER)
  })

  it('setPassword locks the instance; wrong login is rejected, correct login sets a cookie', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const set = makeCaller(db)
    await set.caller.auth.setPassword({ newPassword: PW })
    expect(set.cookies.at(-1)).toBeTruthy() // setting a password logs the setter in

    const anon = makeCaller(db)
    const status = await anon.caller.auth.status()
    expect(status.passwordSet).toBe(true)
    expect(status.authenticated).toBe(false)

    await expect(anon.caller.auth.login({ username: USER, password: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    const login = makeCaller(db)
    const result = await login.caller.auth.login({ username: USER, password: PW })
    expect(result).toEqual({ ok: true })
    const issued = login.cookies.at(-1) as string
    expect(issued).toBeTruthy()

    const authed = makeCaller(db, issued)
    expect((await authed.caller.auth.status()).authenticated).toBe(true)
  })

  it('rejects weak passwords', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const c = makeCaller(db)
    await expect(c.caller.auth.setPassword({ newPassword: 'short' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(c.caller.auth.setPassword({ newPassword: 'password123' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect((await c.caller.auth.status()).passwordSet).toBe(false)
  })

  it('changing the password requires the current one and invalidates old sessions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { token, authed } = await lockAndLogin(db)

    await expect(
      authed.caller.auth.setPassword({ currentPassword: 'nope-nope-nope', newPassword: 'second-strong-pw' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    await authed.caller.auth.setPassword({ currentPassword: PW, newPassword: 'second-strong-pw' })

    // The old cookie no longer authenticates.
    const withOld = makeCaller(db, token)
    expect((await withOld.caller.auth.status()).authenticated).toBe(false)
  })

  it('clearPassword removes auth after verifying the current password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)

    await expect(authed.caller.auth.clearPassword({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    await authed.caller.auth.clearPassword({ currentPassword: PW })
    expect((await makeCaller(db).caller.auth.status()).passwordSet).toBe(false)
  })
})

describe('MFA', () => {
  it('requires an authenticated session to enrol', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lockAndLogin(db)
    const anon = makeCaller(db)
    await expect(anon.caller.auth.enrollMfa()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('enrol → confirm turns MFA on and yields recovery codes', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)

    const enroll = await authed.caller.auth.enrollMfa()
    expect(enroll.secret).toBeTruthy()
    expect(enroll.qrSvg).toContain('<svg')
    expect((await authed.caller.auth.status()).mfaEnabled).toBe(false)

    await expect(authed.caller.auth.confirmMfa({ code: '000000' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const confirm = await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })
    expect(confirm.recoveryCodes).toHaveLength(10)
    expect((await authed.caller.auth.status()).mfaEnabled).toBe(true)
  })

  it('login demands a code once MFA is on, accepts a TOTP', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const enroll = await authed.caller.auth.enrollMfa()
    await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })

    const step1 = makeCaller(db)
    expect(await step1.caller.auth.login({ username: USER, password: PW })).toEqual({ ok: false, mfaRequired: true })
    expect(step1.cookies).toHaveLength(0)

    await expect(
      makeCaller(db).caller.auth.login({ username: USER, password: PW, code: '000000' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const step2 = makeCaller(db)
    const ok = await step2.caller.auth.login({ username: USER, password: PW, code: generateTotp(enroll.secret) })
    expect(ok).toEqual({ ok: true })
    expect(step2.cookies.at(-1)).toBeTruthy()
  })

  it('a recovery code logs in once, then is spent', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const enroll = await authed.caller.auth.enrollMfa()
    const { recoveryCodes } = await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })
    const code = recoveryCodes[0]!

    const first = makeCaller(db)
    expect(await first.caller.auth.login({ username: USER, password: PW, code })).toEqual({ ok: true })

    await expect(
      makeCaller(db).caller.auth.login({ username: USER, password: PW, code }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('disableMfa needs the password and turns MFA back off', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const enroll = await authed.caller.auth.enrollMfa()
    await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })

    await expect(authed.caller.auth.disableMfa({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    await authed.caller.auth.disableMfa({ currentPassword: PW })
    expect((await authed.caller.auth.status()).mfaEnabled).toBe(false)

    const login = makeCaller(db)
    expect(await login.caller.auth.login({ username: USER, password: PW })).toEqual({ ok: true })
  })

  it('re-enrolling while MFA is active needs the password (no silent downgrade)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const enroll = await authed.caller.auth.enrollMfa()
    await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })
    expect((await authed.caller.auth.status()).mfaEnabled).toBe(true)

    // Session alone (or a wrong password) must not overwrite the secret / clear enforcement.
    await expect(authed.caller.auth.enrollMfa()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(authed.caller.auth.enrollMfa({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect((await authed.caller.auth.status()).mfaEnabled).toBe(true)

    // With the password it proceeds (starts a fresh pending secret).
    const re = await authed.caller.auth.enrollMfa({ currentPassword: PW })
    expect(re.secret).toBeTruthy()
  })
})
