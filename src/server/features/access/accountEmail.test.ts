/** A hosted instance requires every account to carry an email address (#199).
 *
 *  Note these tests never combine HEARTH_PUBLIC=1 with the `log` mail transport —
 *  that combination is a startup error by design (#176), so a public instance in
 *  here always has mail off. The "does it actually send" cases use a LAN instance
 *  with an address supplied voluntarily, which exercises the same code path.
 */

import { describe, it, expect, vi } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { getUserByUsername } from '../../auth/session'
import type { DB } from '../../db/client'

const PW = 'strong-new-pw-1'
const REG = { username: 'nadia', displayName: 'Nadia', password: PW, householdName: 'Nadia Home' }
const JOIN = { username: 'sam', displayName: 'Sam', password: PW }

function caller(db: DB, opts: { role?: string; userId?: string } = {}) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

/** A seeded instance with open registration switched on. */
async function openInstance() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const owner = await getUserByUsername(db, 'owner')
  await caller(db, { userId: owner!.id }).c.auth.setRegistrationOpen({ open: true })
  return db
}

/** Run `work` against an instance that declares itself internet-facing. */
async function hosted(work: () => Promise<void>) {
  process.env.HEARTH_PUBLIC = '1'
  try {
    await work()
  } finally {
    delete process.env.HEARTH_PUBLIC
  }
}

/** Run `work` with the `log` transport, collecting what it printed. */
async function withMail(work: (logged: string[]) => Promise<void>) {
  const logged: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
  process.env.HEARTH_MAIL_TRANSPORT = 'log'
  process.env.HEARTH_MAIL_FROM = 'Hearth <hearth@example.com>'
  process.env.HEARTH_PUBLIC_URL = 'https://hearth.example.com'
  try {
    await work(logged)
  } finally {
    spy.mockRestore()
    delete process.env.HEARTH_MAIL_TRANSPORT
    delete process.env.HEARTH_MAIL_FROM
    delete process.env.HEARTH_PUBLIC_URL
  }
}

describe('registration', () => {
  it('refuses an addressless account on a hosted instance', async () => {
    const db = await openInstance()
    await hosted(async () => {
      await expect(caller(db).c.auth.register(REG)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: /email address is required/i,
      })
      expect(await getUserByUsername(db, 'nadia')).toBeNull()

      await caller(db).c.auth.register({ ...REG, email: 'nadia@example.com' })
      expect((await getUserByUsername(db, 'nadia'))?.email).toBe('nadia@example.com')
    })
  })

  it('leaves a LAN install exactly as it was — username only, no address', async () => {
    const db = await openInstance()
    expect(await caller(db).c.auth.register(REG)).toEqual({ ok: true })
    expect((await getUserByUsername(db, 'nadia'))?.email).toBeNull()
  })

  it('sends the confirmation link with the sign-up, unconfirmed until clicked', async () => {
    const db = await openInstance()
    await withMail(async (logged) => {
      await caller(db).c.auth.register({ ...REG, email: 'nadia@example.com' })

      const mail = logged.join('\n')
      expect(mail).toContain('to: nadia@example.com')
      expect(mail).toContain('/verify-email#')
      // Stored but unproven: an address is only a recovery route once clicked.
      expect((await getUserByUsername(db, 'nadia'))?.emailVerifiedAt).toBeNull()
    })
  })
})

describe('invite acceptance', () => {
  /** A pending invite for the seeded household, optionally addressed. */
  async function invite(db: DB, email?: string) {
    const res = await caller(db, { role: 'owner' }).c.invitations.create({ role: 'member', email })
    return res.token
  }

  it('asks the invitee for an address when the invite carried none', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const token = await invite(db)

    await hosted(async () => {
      expect((await caller(db).c.invitations.info({ token }))?.needsEmail).toBe(true)
      await expect(caller(db).c.invitations.accept({ token, ...JOIN })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: /email address is required/i,
      })

      await caller(db).c.invitations.accept({ token, ...JOIN, email: 'sam@example.com' })
      expect((await getUserByUsername(db, 'sam'))?.email).toBe('sam@example.com')
    })
  })

  it("doesn't ask again when the invite already carried an address", async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const token = await invite(db, 'sam@example.com')

    await hosted(async () => {
      expect((await caller(db).c.invitations.info({ token }))?.needsEmail).toBe(false)
      // No address supplied, and none needed — the invite's own is used.
      await caller(db).c.invitations.accept({ token, ...JOIN })
      expect((await getUserByUsername(db, 'sam'))?.email).toBe('sam@example.com')
    })
  })

  it('still joins without one on a LAN install', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const token = await invite(db)

    expect((await caller(db).c.invitations.info({ token }))?.needsEmail).toBe(false)
    await caller(db).c.invitations.accept({ token, ...JOIN })
    expect((await getUserByUsername(db, 'sam'))?.email).toBeNull()
  })

  it('confirms the address the invitee gave, straight away', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const token = await invite(db)

    await withMail(async (logged) => {
      await caller(db).c.invitations.accept({ token, ...JOIN, email: 'sam@example.com' })
      const mail = logged.join('\n')
      expect(mail).toContain('to: sam@example.com')
      expect(mail).toContain('/verify-email#')
    })
  })
})

describe('an address already on the account', () => {
  /** Register Nadia with an address and return a caller acting as her. */
  async function registered(db: DB) {
    await caller(db).c.auth.register({ ...REG, email: 'nadia@example.com' })
    const nadia = await getUserByUsername(db, 'nadia')
    return caller(db, { userId: nadia!.id })
  }

  it('cannot be removed where one is required, but can be changed', async () => {
    const db = await openInstance()
    const nadia = await registered(db)

    await hosted(async () => {
      await expect(nadia.c.users.updateProfile({ email: null, currentPassword: PW })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: /change it rather than removing it/i,
      })
      await nadia.c.users.updateProfile({ email: 'moved@example.com', currentPassword: PW })
      expect((await getUserByUsername(db, 'nadia'))?.email).toBe('moved@example.com')
    })
  })

  it('can still be removed on a LAN install', async () => {
    const db = await openInstance()
    const nadia = await registered(db)

    await nadia.c.users.updateProfile({ email: null, currentPassword: PW })
    expect((await getUserByUsername(db, 'nadia'))?.email).toBeNull()
  })
})

describe('what the client is told', () => {
  it('reports the requirement on auth.status and email.status', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const anon = caller(db)

    expect((await anon.c.auth.status()).emailRequired).toBe(false)
    expect((await anon.c.email.status()).required).toBe(false)

    await hosted(async () => {
      expect((await anon.c.auth.status()).emailRequired).toBe(true)
      expect((await anon.c.email.status()).required).toBe(true)
    })
  })
})
