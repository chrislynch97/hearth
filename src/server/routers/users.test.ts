import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getOwnerUser } from '../auth/session'
import { household, membership, session, user } from '../db/schema'
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

/** Give the owner a password (which issues a session) and return the raw token,
 *  so switchHousehold has a real session to mutate. */
async function ownerSession(db: DB, userId: string) {
  const setup = caller(db, { role: 'owner', userId })
  await setup.c.auth.setPassword({ newPassword: 'owner-strong-pw' })
  return setup.cookies.at(-1) as string
}

describe('users.me', () => {
  it('is null without a resolved identity', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    expect(await caller(db).c.users.me()).toBeNull()
  })

  it('returns the identity, active household, and accepted memberships', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const me = await caller(db, { role: 'owner', userId: owner!.id }).c.users.me()
    expect(me?.username).toBe('owner')
    expect(me?.activeHouseholdId).toBe('household')
    expect(me?.role).toBe('owner')
    expect(me?.memberships.map((m) => m.householdId)).toContain('household')
  })

  it('omits households the user was invited to but has not accepted', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    // A pending (unaccepted) grant to a second household must not appear.
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: 'm-pending',
      userId: owner!.id,
      householdId: 'h2',
      role: 'member',
      invitedAt: now,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const me = await caller(db, { role: 'owner', userId: owner!.id }).c.users.me()
    expect(me?.memberships.map((m) => m.householdId)).not.toContain('h2')
  })
})

describe('users.updateProfile', () => {
  it('rejects an unauthenticated caller', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await expect(caller(db).c.users.updateProfile({ displayName: 'X' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('updates the current user and lowercases the username', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const res = await caller(db, { userId: owner!.id }).c.users.updateProfile({
      displayName: '  Renamed  ',
      username: 'OWNER-Renamed',
      email: 'owner@example.com',
    })
    expect(res.displayName).toBe('Renamed')
    expect(res.username).toBe('owner-renamed')
    expect(res.email).toBe('owner@example.com')
  })

  it('rejects a username already taken by another user', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    // A second account holding the username we'll try to steal.
    const now = new Date()
    await db.insert(user).values({
      id: 'u2',
      username: 'taken',
      displayName: 'Taken',
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      caller(db, { userId: owner!.id }).c.users.updateProfile({ username: 'taken' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // Re-saving your own username is not a clash with yourself.
    await expect(
      caller(db, { userId: owner!.id }).c.users.updateProfile({ username: 'owner' }),
    ).resolves.toMatchObject({ username: 'owner' })
  })
})

describe('users.switchHousehold', () => {
  it('rejects when there is no active session', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    // A userId with no (or a bogus) session token → no session to switch within.
    await expect(
      caller(db, { userId: owner!.id, sessionToken: 'not-a-real-token' }).c.users.switchHousehold({
        householdId: 'household',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects a household the user does not belong to', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    const token = await ownerSession(db, owner!.id)

    await expect(
      caller(db, { userId: owner!.id, sessionToken: token }).c.users.switchHousehold({ householdId: 'h2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects a household the user was invited to but has not accepted', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: 'm-pending',
      userId: owner!.id,
      householdId: 'h2',
      role: 'member',
      invitedAt: now,
      acceptedAt: null, // pending — not a member yet
      createdAt: now,
      updatedAt: now,
    })
    const token = await ownerSession(db, owner!.id)

    await expect(
      caller(db, { userId: owner!.id, sessionToken: token }).c.users.switchHousehold({ householdId: 'h2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('switches to an accepted household and persists it on the session row', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    // A second household the owner is genuinely a member of.
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: 'm-accepted',
      userId: owner!.id,
      householdId: 'h2',
      role: 'admin',
      invitedAt: now,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const token = await ownerSession(db, owner!.id)

    const res = await caller(db, { userId: owner!.id, sessionToken: token }).c.users.switchHousehold({
      householdId: 'h2',
    })
    expect(res).toEqual({ activeHouseholdId: 'h2' })

    // The change is durable: the session row now points at the new household.
    const [row] = await db.select().from(session).where(eq(session.activeHouseholdId, 'h2'))
    expect(row).toBeTruthy()
  })
})
