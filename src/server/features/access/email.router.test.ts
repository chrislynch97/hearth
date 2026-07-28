import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { auditLog, user } from '../../db/schema'
import { getOwnerUser, getValidSession } from '../../auth/session'
import type { DB } from '../../db/client'

const PW = 'correct-horse-staple'
const ADDRESS = 'owner@example.com'
const ORIGIN = 'https://hearth.example.com'

/** Run the whole flow against the `log` transport and read the token back out of
 *  what it printed. Exercises config, templates and link-building for real,
 *  rather than asserting against a stub the production path never uses. */
let logged: string[] = []
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.HEARTH_MAIL_TRANSPORT = 'log'
  process.env.HEARTH_MAIL_FROM = 'Hearth <hearth@example.com>'
  process.env.HEARTH_PUBLIC_URL = ORIGIN
  logged = []
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
})

afterEach(() => {
  logSpy.mockRestore()
  delete process.env.HEARTH_MAIL_TRANSPORT
  delete process.env.HEARTH_MAIL_FROM
  delete process.env.HEARTH_PUBLIC_URL
})

/** The token from the most recent email whose link is under `path`. */
function tokenFromMail(path: string): string {
  const match = logged
    .join('\n')
    .match(new RegExp(`${ORIGIN.replace(/[.]/g, '\\.')}${path}#([0-9a-f]{64})`))
  if (!match) throw new Error(`no ${path} link in: ${logged.join('\n')}`)
  return match[1]!
}

function makeCaller(db: DB, opts: { sessionToken?: string; userId?: string; clientKey?: string } = {}) {
  const cookies: Array<string | null> = []
  const caller = appRouter.createCaller({
    db,
    householdId: 'household',
    role: 'owner',
    userId: opts.userId,
    sessionToken: opts.sessionToken,
    clientKey: opts.clientKey ?? 'test',
    setSessionCookie: (t) => cookies.push(t),
  })
  return { caller, cookies }
}

/** A locked instance with a logged-in owner who has an unverified address. */
async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const open = makeCaller(db)
  await open.caller.auth.setPassword({ newPassword: PW })
  const token = open.cookies.at(-1) as string
  const owner = (await getOwnerUser(db))!
  const authed = makeCaller(db, { sessionToken: token, userId: owner.id })
  await authed.caller.users.updateProfile({ email: ADDRESS, currentPassword: PW })
  return { db, owner, authed, anon: makeCaller(db), sessionToken: token }
}

const actions = async (db: DB) => (await db.select().from(auditLog)).map((r) => r.action)

describe('email.status', () => {
  it('reports the address and whether this instance can send at all', async () => {
    const { authed } = await setup()
    expect(await authed.caller.email.status()).toEqual({
      enabled: true,
      email: ADDRESS,
      verified: false,
      required: false,
    })

    delete process.env.HEARTH_MAIL_TRANSPORT
    expect((await authed.caller.email.status()).enabled).toBe(false)
  })
})

describe('email verification', () => {
  it('emails a link that confirms the address', async () => {
    const { db, owner, authed, anon } = await setup()

    expect(await authed.caller.email.sendVerification()).toEqual({ sent: true, alreadyVerified: false })
    const token = tokenFromMail('/verify-email')

    // Claimed anonymously: the link opens in whatever browser the mail app hands
    // it to, which usually has no session.
    expect(await anon.caller.email.verify({ token })).toEqual({ ok: true, email: ADDRESS })

    const [row] = await db.select().from(user).where(eq(user.id, owner.id))
    expect(row!.emailVerifiedAt).not.toBeNull()
    expect(await actions(db)).toContain('email_verified')
  })

  it('never writes the token to the audit trail (#49)', async () => {
    const { db, authed } = await setup()
    await authed.caller.email.sendVerification()
    const token = tokenFromMail('/verify-email')

    const rows = await db.select().from(auditLog)
    expect(JSON.stringify(rows)).not.toContain(token)
    expect(await actions(db)).toContain('email_verification_sent')
  })

  it('is single-use', async () => {
    const { authed, anon } = await setup()
    await authed.caller.email.sendVerification()
    const token = tokenFromMail('/verify-email')

    await anon.caller.email.verify({ token })
    await expect(anon.caller.email.verify({ token })).rejects.toThrow(/invalid, already used, or expired/)
  })

  it('rejects an unknown token', async () => {
    const { anon } = await setup()
    await expect(anon.caller.email.verify({ token: 'f'.repeat(64) })).rejects.toThrow(/invalid, already used/)
  })

  it('will not confirm an address the account has since moved off', async () => {
    const { authed, anon } = await setup()
    await authed.caller.email.sendVerification()
    const token = tokenFromMail('/verify-email')

    await authed.caller.users.updateProfile({ email: 'moved@example.com', currentPassword: PW })

    await expect(anon.caller.email.verify({ token })).rejects.toThrow(/no longer on the account/)
    expect((await authed.caller.email.status()).verified).toBe(false)
  })

  it('drops the confirmation when the address changes (#111)', async () => {
    const { authed, anon } = await setup()
    await authed.caller.email.sendVerification()
    await anon.caller.email.verify({ token: tokenFromMail('/verify-email') })
    expect((await authed.caller.email.status()).verified).toBe(true)

    await authed.caller.users.updateProfile({ email: 'moved@example.com', currentPassword: PW })
    expect(await authed.caller.email.status()).toEqual({
      enabled: true,
      email: 'moved@example.com',
      verified: false,
      required: false,
    })
  })

  it('is a no-op once the address is already confirmed', async () => {
    const { authed, anon } = await setup()
    await authed.caller.email.sendVerification()
    await anon.caller.email.verify({ token: tokenFromMail('/verify-email') })

    expect(await authed.caller.email.sendVerification()).toEqual({ sent: false, alreadyVerified: true })
  })

  it('refuses when the account has no address, or the instance cannot send', async () => {
    const { authed } = await setup()
    await authed.caller.users.updateProfile({ email: null, currentPassword: PW })
    await expect(authed.caller.email.sendVerification()).rejects.toThrow(/Add an email address/)

    delete process.env.HEARTH_MAIL_TRANSPORT
    await expect(authed.caller.email.sendVerification()).rejects.toThrow(/not set up to send email/)
  })

  it('throttles resends per account', async () => {
    const { authed } = await setup()
    for (let i = 0; i < 5; i++) await authed.caller.email.sendVerification()
    await expect(authed.caller.email.sendVerification()).rejects.toThrow(/Too many verification emails/)
  })
})

describe('password reset', () => {
  /** Confirm the owner's address, which is what makes them resettable. */
  async function verified() {
    const s = await setup()
    await s.authed.caller.email.sendVerification()
    await s.anon.caller.email.verify({ token: tokenFromMail('/verify-email') })
    logged = []
    return s
  }

  it('is offered only on an instance that can send mail', async () => {
    const { anon } = await setup()
    expect((await anon.caller.auth.status()).passwordResetAvailable).toBe(true)

    delete process.env.HEARTH_MAIL_TRANSPORT
    expect((await anon.caller.auth.status()).passwordResetAvailable).toBe(false)
  })

  it('emails a link that sets a new password', async () => {
    const { db, anon } = await verified()

    expect(await anon.caller.auth.requestPasswordReset({ username: 'owner' })).toEqual({ ok: true })
    const token = tokenFromMail('/reset-password')

    expect(await anon.caller.auth.resetPassword({ token, newPassword: 'brand-new-passphrase' })).toEqual({ ok: true })

    const login = makeCaller(db)
    expect(await login.caller.auth.login({ username: 'owner', password: 'brand-new-passphrase' })).toEqual({ ok: true })
    expect(await actions(db)).toEqual(expect.arrayContaining(['password_reset_requested', 'password_reset']))
  })

  it('does not sign the resetter in, so MFA still applies at login', async () => {
    const { anon } = await verified()
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })

    await anon.caller.auth.resetPassword({
      token: tokenFromMail('/reset-password'),
      newPassword: 'brand-new-passphrase',
    })
    // The only cookie written is the one clearing any session on this browser.
    expect(anon.cookies).toEqual([null])
  })

  it('revokes every existing session, including one an attacker already holds', async () => {
    const { db, anon, sessionToken } = await verified()
    expect(await getValidSession(db, sessionToken)).not.toBeNull()

    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    await anon.caller.auth.resetPassword({
      token: tokenFromMail('/reset-password'),
      newPassword: 'brand-new-passphrase',
    })

    expect(await getValidSession(db, sessionToken)).toBeNull()
  })

  it('says the same thing for an unknown username as for a real one', async () => {
    const { anon } = await verified()

    expect(await anon.caller.auth.requestPasswordReset({ username: 'nobody-here' })).toEqual({ ok: true })
    expect(logged.join('\n')).not.toContain('/reset-password#')
  })

  it('refuses to mail an unconfirmed address', async () => {
    // `setup` leaves the address unverified — the state an invite or a typo in
    // the profile form produces.
    const { anon } = await setup()

    expect(await anon.caller.auth.requestPasswordReset({ username: 'owner' })).toEqual({ ok: true })
    expect(logged.join('\n')).not.toContain('/reset-password#')
  })

  it('is silent when the instance cannot send mail', async () => {
    const { anon } = await verified()
    delete process.env.HEARTH_MAIL_TRANSPORT

    expect(await anon.caller.auth.requestPasswordReset({ username: 'owner' })).toEqual({ ok: true })
    expect(logged.join('\n')).not.toContain('/reset-password#')
  })

  it('is single-use', async () => {
    const { anon } = await verified()
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    const token = tokenFromMail('/reset-password')

    await anon.caller.auth.resetPassword({ token, newPassword: 'brand-new-passphrase' })
    await expect(anon.caller.auth.resetPassword({ token, newPassword: 'another-good-passphrase' })).rejects.toThrow(
      /invalid, already used, or expired/,
    )
  })

  it('leaves the link usable when the new password is rejected', async () => {
    const { anon } = await verified()
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    const token = tokenFromMail('/reset-password')

    await expect(anon.caller.auth.resetPassword({ token, newPassword: 'short' })).rejects.toThrow()
    expect(await anon.caller.auth.resetPassword({ token, newPassword: 'brand-new-passphrase' })).toEqual({ ok: true })
  })

  it('retires an earlier link when a second is requested', async () => {
    const { anon } = await verified()
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    const first = tokenFromMail('/reset-password')
    logged = []
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    const second = tokenFromMail('/reset-password')

    await expect(anon.caller.auth.resetPassword({ token: first, newPassword: 'brand-new-passphrase' })).rejects.toThrow()
    expect(await anon.caller.auth.resetPassword({ token: second, newPassword: 'brand-new-passphrase' })).toEqual({
      ok: true,
    })
  })

  it('never writes the token to the audit trail (#49)', async () => {
    const { db, anon } = await verified()
    await anon.caller.auth.requestPasswordReset({ username: 'owner' })
    const token = tokenFromMail('/reset-password')

    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(token)
  })
})
