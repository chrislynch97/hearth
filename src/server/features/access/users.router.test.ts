import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { getOwnerUser, getUser } from '../../auth/session'
import { household, membership, session, user } from '../../db/schema'
import type { DB } from '../../db/client'

// A password comfortably clearing the strength policy.
const PW = 'correct-horse-staple'

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

// A stolen session must not be able to quietly take the account over by renaming
// it and repointing the (recovery-relevant) email (issue #50).
describe('users.updateProfile password confirmation (issue #50)', () => {
  /** Lock the instance by giving the owner a password; returns the owner id. */
  async function lockedOwner(db: DB) {
    const owner = (await getOwnerUser(db))!
    await caller(db, { role: 'owner', userId: owner.id }).c.auth.setPassword({ newPassword: PW })
    return owner.id
  }

  it('demands the current password to change the username', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const userId = await lockedOwner(db)
    const me = caller(db, { userId }).c

    await expect(me.users.updateProfile({ username: 'stolen' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      me.users.updateProfile({ username: 'stolen', currentPassword: 'wrong-password-x' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // Unchanged: neither attempt got through.
    expect((await getUser(db, userId))!.username).toBe('owner')

    await expect(me.users.updateProfile({ username: 'renamed', currentPassword: PW })).resolves.toMatchObject({
      username: 'renamed',
    })
  })

  it('demands the current password to change the email', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const userId = await lockedOwner(db)
    const me = caller(db, { userId }).c

    await expect(me.users.updateProfile({ email: 'attacker@evil.example' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect((await getUser(db, userId))!.email).not.toBe('attacker@evil.example')

    await expect(
      me.users.updateProfile({ email: 'me@example.com', currentPassword: PW }),
    ).resolves.toMatchObject({ email: 'me@example.com' })
  })

  it('lets a display-name-only change through without a password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const userId = await lockedOwner(db)

    await expect(
      caller(db, { userId }).c.users.updateProfile({ displayName: 'New Name' }),
    ).resolves.toMatchObject({ displayName: 'New Name' })
  })

  it('does not demand a password when username/email are re-submitted unchanged', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const userId = await lockedOwner(db)
    await caller(db, { userId }).c.users.updateProfile({ email: 'me@example.com', currentPassword: PW })

    // A form that posts every field on every save must not demand a password for
    // what is, in substance, a display-name edit.
    await expect(
      caller(db, { userId }).c.users.updateProfile({
        username: 'OWNER', // same after normalisation
        email: 'me@example.com',
        displayName: 'Cosmetic',
      }),
    ).resolves.toMatchObject({ displayName: 'Cosmetic', username: 'owner' })
  })

  it('needs no password on an open instance, which has none to confirm', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))! // no password set: instance is open

    await expect(
      caller(db, { userId: owner.id }).c.users.updateProfile({ username: 'renamed' }),
    ).resolves.toMatchObject({ username: 'renamed' })
  })

  it('reports a lost username race as “taken”, not a raw 500', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const userId = await lockedOwner(db)

    // The real race — two renames passing the friendly pre-check, then the unique
    // index rejecting the loser's write — can't be staged deterministically
    // in-process. Make the write fail exactly as Postgres would instead
    // (SQLSTATE 23505), which is the input the resolver has to handle.
    const dup = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
    const racingDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'update') {
          return () => {
            throw dup
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as DB

    await expect(
      caller(racingDb, { userId }).c.users.updateProfile({ username: 'free-name', currentPassword: PW }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'That username is taken.' })
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
