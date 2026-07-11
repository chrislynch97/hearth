import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getOwnerUser } from '../auth/session'
import { household, membership } from '../db/schema'
import type { DB } from '../db/client'

function caller(db: DB, opts: { role?: string; userId?: string; sessionToken?: string } = {}) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    sessionToken: opts.sessionToken,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

describe('role enforcement', () => {
  it('viewers cannot write, but owners can', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const viewer = caller(db, { role: 'viewer' })
    await expect(viewer.c.categories.create({ name: 'Nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const owner = caller(db, { role: 'owner' })
    await expect(owner.c.categories.create({ name: 'Yes' })).resolves.toBeTruthy()
  })

  it('an unknown/undefined role cannot write (guard fails closed)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    // A removed member still holding a session resolves to role === undefined.
    // The write guard must deny by default rather than let them through.
    const stranger = caller(db, { role: undefined })
    await expect(stranger.c.categories.create({ name: 'Nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Self-service/auth mutations stay open so they can still log out.
    await expect(stranger.c.auth.logout()).resolves.toBeTruthy()
  })

  it('household settings are gated by role; whole-instance reset needs the instance owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const member = caller(db, { role: 'member' })
    await expect(member.c.household.update({ displayName: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const admin = caller(db, { role: 'admin' })
    await expect(admin.c.household.update({ displayName: 'Renamed' })).resolves.toBeTruthy()
    // data.reset is whole-instance, so even an admin can't — only the instance
    // owner can (exercised in data.test.ts). Here the admin has no userId, so the
    // instance-owner check rejects them.
    await expect(admin.c.data.reset()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('invitations', () => {
  it('members cannot invite; admins can invite member/viewer; only owners invite admins', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    await expect(caller(db, { role: 'member' }).c.invitations.create({ role: 'member' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller(db, { role: 'admin' }).c.invitations.create({ role: 'member' })).resolves.toMatchObject({
      role: 'member',
    })
    await expect(caller(db, { role: 'admin' }).c.invitations.create({ role: 'admin' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller(db, { role: 'owner' }).c.invitations.create({ role: 'admin' })).resolves.toMatchObject({
      role: 'admin',
    })
  })

  it('accept creates an account + membership and logs in; the token is single-use', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const owner = await getOwnerUser(db)
    const { token } = await caller(db, { role: 'owner', userId: owner!.id }).c.invitations.create({ role: 'member' })

    // Public info describes the invite.
    const info = await caller(db).c.invitations.info({ token })
    expect(info?.role).toBe('member')

    // Accept it → new user, membership, session cookie.
    const invitee = caller(db)
    const res = await invitee.c.invitations.accept({
      token,
      username: 'ben',
      displayName: 'Ben',
      password: 'another-strong-pw',
    })
    expect(res).toEqual({ ok: true })
    expect(invitee.cookies.at(-1)).toBeTruthy()

    // The new account can log in and sees its membership.
    const login = caller(db)
    // Lock the instance by giving the owner a password first, so login is live.
    await caller(db, { role: 'owner', userId: owner!.id }).c.auth.setPassword({ newPassword: 'owner-strong-pw' })
    expect(await login.c.auth.login({ username: 'ben', password: 'another-strong-pw' })).toEqual({ ok: true })

    // Token can't be reused.
    await expect(
      caller(db).c.invitations.accept({ token, username: 'x', displayName: 'X', password: 'yet-another-pw' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // And it no longer shows as pending.
    const pending = await caller(db, { role: 'owner', userId: owner!.id }).c.invitations.list()
    expect(pending).toHaveLength(0)
  })

  it('a token redeemed concurrently creates exactly one account (#26)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const owner = await getOwnerUser(db)
    const { token } = await caller(db, { role: 'owner', userId: owner!.id }).c.invitations.create({ role: 'member' })

    // Fire several accepts of the same token at once, each with a distinct
    // username. The invite is claimed with a conditional UPDATE inside a
    // transaction, so only one can win — the rest must fail (whether with the
    // friendly "invalid/expired" or, under SQLite's writer lock, a busy error).
    const attempts = [1, 2, 3, 4].map((n) =>
      caller(db).c.invitations.accept({
        token,
        username: `racer${n}`,
        displayName: `Racer ${n}`,
        password: 'a-strong-password',
      }),
    )
    const results = await Promise.allSettled(attempts)
    const won = results.filter((r) => r.status === 'fulfilled')
    expect(won).toHaveLength(1)

    // Exactly one new membership beyond the owner's, and the invite is spent.
    const grants = await db.select().from(membership)
    expect(grants).toHaveLength(2) // owner + the single winning invitee
    const pending = await caller(db, { role: 'owner', userId: owner!.id }).c.invitations.list()
    expect(pending).toHaveLength(0)
  })
})

describe('switchHousehold', () => {
  it('rejects a household the user does not belong to', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    // A second household the owner is NOT a member of.
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })

    // Give the owner a real session to switch within.
    const setup = caller(db, { role: 'owner', userId: owner!.id })
    await setup.c.auth.setPassword({ newPassword: 'owner-strong-pw' })
    const token = setup.cookies.at(-1) as string

    await expect(
      caller(db, { userId: owner!.id, sessionToken: token }).c.users.switchHousehold({ householdId: 'h2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Owner IS a member of the default household → allowed.
    await expect(
      caller(db, { userId: owner!.id, sessionToken: token }).c.users.switchHousehold({ householdId: 'household' }),
    ).resolves.toEqual({ activeHouseholdId: 'household' })
    // (membership row exists from ensureSeed)
    expect(await db.select().from(membership)).not.toHaveLength(0)
  })
})
