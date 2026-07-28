import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { generateTotp } from '../../auth/totp'
import { getValidSession } from '../../auth/session'
import type { DB } from '../../db/client'

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

/** Enrol and confirm MFA, returning the secret and a caller on the session that
 *  confirming left behind. `confirmMfa` revokes every existing session and
 *  re-issues one (#50), so the token that went in is dead on the way out — a real
 *  browser just follows the new Set-Cookie, which is what this mirrors. */
async function enableMfa(db: DB, authed: ReturnType<typeof makeCaller>) {
  const enroll = await authed.caller.auth.enrollMfa()
  const { recoveryCodes } = await authed.caller.auth.confirmMfa({ code: generateTotp(enroll.secret) })
  return { secret: enroll.secret, recoveryCodes, authed: makeCaller(db, authed.cookies.at(-1) as string) }
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

  it('flags firstRunRequired only for an open instance exposed off-box (#34)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = makeCaller(db)
    const prevHost = process.env.HOST
    const prevAllow = process.env.HEARTH_ALLOW_OPEN
    try {
      // Open + off-box + no opt-in: the app is otherwise bricked, so the client
      // must show the first-run set-password screen.
      process.env.HOST = '0.0.0.0'
      delete process.env.HEARTH_ALLOW_OPEN
      expect((await caller.auth.status()).firstRunRequired).toBe(true)

      // Loopback bind is reachable only on-box, so no first-run gate is needed.
      process.env.HOST = '127.0.0.1'
      expect((await caller.auth.status()).firstRunRequired).toBe(false)

      // Explicit opt-in also clears it.
      process.env.HOST = '0.0.0.0'
      process.env.HEARTH_ALLOW_OPEN = '1'
      expect((await caller.auth.status()).firstRunRequired).toBe(false)

      // Once a password is set the instance is locked, so it's never first-run.
      delete process.env.HEARTH_ALLOW_OPEN
      await makeCaller(db).caller.auth.setPassword({ newPassword: PW })
      expect((await caller.auth.status()).firstRunRequired).toBe(false)
    } finally {
      if (prevHost === undefined) delete process.env.HOST
      else process.env.HOST = prevHost
      if (prevAllow === undefined) delete process.env.HEARTH_ALLOW_OPEN
      else process.env.HEARTH_ALLOW_OPEN = prevAllow
    }
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

  it('caps the length of unauthenticated inputs, before any scrypt work (#45)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const set = makeCaller(db)
    await set.caller.auth.setPassword({ newPassword: PW }) // lock the instance

    const anon = makeCaller(db)
    // A multi-megabyte "password" must be rejected by zod (BAD_REQUEST), not fed
    // to scrypt — the login rate limiter counts a scrypt-spending attempt.
    await expect(
      anon.caller.auth.login({ username: USER, password: 'x'.repeat(256 + 1) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // An oversized username is likewise rejected up front.
    await expect(
      anon.caller.auth.login({ username: 'u'.repeat(100 + 1), password: PW }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
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
    // Confirming re-issues the session, so read status through the new cookie.
    const after = makeCaller(db, authed.cookies.at(-1) as string)
    expect((await after.caller.auth.status()).mfaEnabled).toBe(true)
  })

  it('turning MFA on revokes every other session and keeps the enabler in (#50)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)

    // A second session, standing in for an attacker who already holds a stolen
    // cookie: enabling MFA only gates *new* logins, so unless we revoke it the
    // intruder keeps the access the user is trying to shut off.
    const attacker = makeCaller(db)
    await attacker.caller.auth.login({ username: USER, password: PW })
    const attackerToken = attacker.cookies.at(-1) as string
    expect(await getValidSession(db, attackerToken)).not.toBeNull()

    const { authed: after } = await enableMfa(db, authed)

    expect(await getValidSession(db, attackerToken)).toBeNull()
    expect((await makeCaller(db, attackerToken).caller.auth.status()).authenticated).toBe(false)
    // The person who enabled it stays signed in on a fresh session.
    expect((await after.caller.auth.status()).mfaEnabled).toBe(true)
    expect((await after.caller.auth.status()).authenticated).toBe(true)
  })

  it('login demands a code once MFA is on, accepts a TOTP', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const { secret } = await enableMfa(db, authed)

    const step1 = makeCaller(db)
    expect(await step1.caller.auth.login({ username: USER, password: PW })).toEqual({ ok: false, mfaRequired: true })
    expect(step1.cookies).toHaveLength(0)

    await expect(
      makeCaller(db).caller.auth.login({ username: USER, password: PW, code: '000000' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const step2 = makeCaller(db)
    const ok = await step2.caller.auth.login({ username: USER, password: PW, code: generateTotp(secret) })
    expect(ok).toEqual({ ok: true })
    expect(step2.cookies.at(-1)).toBeTruthy()
  })

  it('a recovery code logs in once, then is spent', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const { recoveryCodes } = await enableMfa(db, authed)
    const code = recoveryCodes[0]!

    const first = makeCaller(db)
    expect(await first.caller.auth.login({ username: USER, password: PW, code })).toEqual({ ok: true })

    await expect(
      makeCaller(db).caller.auth.login({ username: USER, password: PW, code }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects a replayed TOTP code within its validity window (#14)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed } = await lockAndLogin(db)
    const { secret } = await enableMfa(db, authed)

    const code = generateTotp(secret)
    const first = makeCaller(db)
    expect(await first.caller.auth.login({ username: USER, password: PW, code })).toEqual({ ok: true })

    // The very same code must not work a second time, even though it's still in
    // its ±1-step window.
    await expect(
      makeCaller(db).caller.auth.login({ username: USER, password: PW, code }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('disableMfa needs the password and turns MFA back off', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed: after } = await enableMfa(db, (await lockAndLogin(db)).authed)

    await expect(after.caller.auth.disableMfa({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    await after.caller.auth.disableMfa({ currentPassword: PW })
    expect((await after.caller.auth.status()).mfaEnabled).toBe(false)

    const login = makeCaller(db)
    expect(await login.caller.auth.login({ username: USER, password: PW })).toEqual({ ok: true })
  })

  it('re-enrolling while MFA is active needs the password (no silent downgrade)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { authed: after } = await enableMfa(db, (await lockAndLogin(db)).authed)
    expect((await after.caller.auth.status()).mfaEnabled).toBe(true)

    // Session alone (or a wrong password) must not overwrite the secret / clear enforcement.
    await expect(after.caller.auth.enrollMfa()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(after.caller.auth.enrollMfa({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect((await after.caller.auth.status()).mfaEnabled).toBe(true)

    // With the password it proceeds (starts a fresh pending secret).
    const re = await after.caller.auth.enrollMfa({ currentPassword: PW })
    expect(re.secret).toBeTruthy()
  })
})
