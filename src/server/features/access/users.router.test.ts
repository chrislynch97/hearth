import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { createSession, getOwnerUser, getUser, getValidSession } from '../../auth/session'
import { hashPassword } from '../../auth/password'
import { generateTotp } from '../../auth/totp'
import { auditLog, household, invitation, member, membership, pot, session, user } from '../../db/schema'
import type { DB } from '../../db/client'
import { newId } from '../../../shared/ids'

// A password comfortably clearing the strength policy.
const PW = 'correct-horse-staple'

function caller(
  db: DB,
  opts: { householdId?: string; role?: string; userId?: string; sessionToken?: string } = {},
) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: opts.householdId ?? 'household',
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
    expect(me?.isPrimaryHousehold).toBe(true)
  })

  // Drives the UI's explanation of why erasure is refused on the primary
  // household (#228) — the client must not have to know the magic id.
  it('flags whether the active household is the primary one', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: 'm-h2',
      userId: owner!.id,
      householdId: 'h2',
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const me = await caller(db, { householdId: 'h2', role: 'owner', userId: owner!.id }).c.users.me()
    expect(me?.isPrimaryHousehold).toBe(false)
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

// Erasure under GDPR is about the person, not the tenant: #110 gave households a
// delete button, and left every login behind (issue #230).
describe('users.deleteAccount', () => {
  /** A second household with its own owner account, carrying a real password hash
   *  and MFA material so the confirmation paths have something to check. */
  async function secondHousehold(db: DB, opts: { id?: string; username?: string } = {}) {
    const now = new Date()
    const householdId = opts.id ?? 'h2'
    const userId = newId()
    await db.insert(household).values({ id: householdId, createdAt: now, updatedAt: now })
    await db.insert(user).values({
      id: userId,
      username: opts.username ?? 'h2owner',
      email: 'h2owner@example.com',
      displayName: 'H2 Owner',
      passwordHash: await hashPassword(PW),
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      mfaRecoveryCodes: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(membership).values({
      id: newId(),
      userId,
      householdId,
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    return { userId, householdId }
  }

  /** Add someone else to a household, so it isn't the target's alone. */
  async function addPeer(db: DB, householdId: string, role: string, username: string) {
    const now = new Date()
    const userId = newId()
    await db.insert(user).values({ id: userId, username, displayName: username, createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId,
      householdId,
      role,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    return userId
  }

  it('rejects an unauthenticated caller', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await expect(caller(db).c.users.deleteAccount({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('refuses the instance owner outright', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    await expect(
      caller(db, { role: 'owner', userId: owner!.id }).c.users.deleteAccount({}),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await getUser(db, owner!.id)).not.toBeNull()
  })

  it('demands the current password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    const me = caller(db, { householdId, role: 'owner', userId }).c

    await expect(me.users.deleteAccount({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(me.users.deleteAccount({ currentPassword: 'wrong-password-x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await getUser(db, userId)).not.toBeNull()
  })

  it('demands the MFA code where the account is enrolled', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    await db.update(user).set({ mfaEnabledAt: new Date() }).where(eq(user.id, userId))
    const me = caller(db, { householdId, role: 'owner', userId }).c

    // The password alone is no longer enough, and a wrong code is not either.
    await expect(me.users.deleteAccount({ currentPassword: PW })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(me.users.deleteAccount({ currentPassword: PW, code: '000000' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await getUser(db, userId)).not.toBeNull()

    const [row] = await db.select().from(user).where(eq(user.id, userId))
    await expect(
      me.users.deleteAccount({ currentPassword: PW, code: generateTotp(row!.mfaSecret!) }),
    ).resolves.toMatchObject({ ok: true })
    expect(await getUser(db, userId)).toBeNull()
  })

  it('refuses while the caller is the sole owner of a household others are still in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    await addPeer(db, householdId, 'member', 'peer')
    const me = caller(db, { householdId, role: 'owner', userId }).c

    const impact = await me.users.deletionImpact()
    expect(impact.blockedBy.map((h) => h.id)).toEqual([householdId])
    expect(impact.households).toEqual([])

    await expect(me.users.deleteAccount({ currentPassword: PW })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('only owner'),
    })
    expect(await getUser(db, userId)).not.toBeNull()
  })

  it('lets a sole owner go once someone else owns the household too', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    const peer = await addPeer(db, householdId, 'owner', 'coowner')
    const me = caller(db, { householdId, role: 'owner', userId }).c

    await expect(me.users.deletionImpact()).resolves.toMatchObject({ blockedBy: [], households: [] })
    await expect(me.users.deleteAccount({ currentPassword: PW })).resolves.toEqual({
      ok: true,
      householdsDeleted: 0,
    })

    // The household stays, with its remaining owner.
    expect(await getUser(db, userId)).toBeNull()
    expect(await getUser(db, peer)).not.toBeNull()
    expect((await db.select().from(household)).map((h) => h.id)).toContain(householdId)
  })

  it('deletes the account, its sessions and the households nobody else is left in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    const token = await createSession(db, userId, householdId)
    const me = caller(db, { householdId, role: 'owner', userId }).c

    await expect(me.users.deletionImpact()).resolves.toMatchObject({
      blockedBy: [],
      households: [{ id: householdId, name: 'My Household' }],
      isInstanceOwner: false,
      passwordRequired: true,
      mfaRequired: false,
    })
    await expect(me.users.deleteAccount({ currentPassword: PW })).resolves.toEqual({
      ok: true,
      householdsDeleted: 1,
    })

    expect(await getUser(db, userId)).toBeNull()
    expect(await getValidSession(db, token)).toBeNull()
    expect(await db.select().from(membership).where(eq(membership.userId, userId))).toHaveLength(0)
    // The household went too: leaving it would strand a household's financial
    // records where nobody can ever reach — or erase — them.
    expect((await db.select().from(household)).map((h) => h.id)).toEqual(['household'])
  })

  it('leaves the household’s budgeting history intact, with the member unlinked', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    // A co-owner keeps the household alive, so its history has somewhere to stay.
    await addPeer(db, householdId, 'owner', 'coowner')
    const me = caller(db, { householdId, role: 'owner', userId }).c

    const alice = await me.members.addPerson({ displayName: 'Alice' })
    await db.update(member).set({ userId }).where(eq(member.id, alice.id))
    const potRow = await me.pots.create({ name: 'Rent', ownerId: alice.id })

    await me.users.deleteAccount({ currentPassword: PW })

    // `member.userId` has no FK, so it's unlinked rather than cascaded: the
    // household's spends must not disappear because a person left.
    const [row] = await db.select().from(member).where(eq(member.id, alice.id))
    expect(row?.displayName).toBe('Alice')
    expect(row?.userId).toBeNull()
    expect(await db.select().from(pot).where(eq(pot.id, potRow.id))).toHaveLength(1)
  })

  it('records the erasure on the primary household without keeping the identity', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    await caller(db, { householdId, role: 'owner', userId }).c.users.deleteAccount({ currentPassword: PW })

    const [event] = await db.select().from(auditLog).where(eq(auditLog.action, 'account_deleted'))
    expect(event?.householdId).toBe('household') // survives the household it erased
    expect(event?.actorUserId).toBeNull()
    expect(event?.actorLabel).toBeNull()
    expect(event?.entityId).not.toBe(userId)
    expect(event?.changes).not.toContain(userId)
    expect(event?.changes).not.toContain('h2owner@example.com')
  })

  it('does not block on a pending invitation the account issued', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { userId, householdId } = await secondHousehold(db)
    await addPeer(db, householdId, 'owner', 'coowner')
    const me = caller(db, { householdId, role: 'owner', userId }).c
    await me.invitations.create({ role: 'member' })

    // `invitation.invitedByUserId` is ON DELETE NO ACTION, so without nulling it
    // the delete fails on the FK instead of erasing the account.
    await expect(me.users.deleteAccount({ currentPassword: PW })).resolves.toMatchObject({ ok: true })
    const [inv] = await db.select().from(invitation)
    expect(inv?.invitedByUserId).toBeNull()
  })
})

// An account with no membership can never get one back — accepting an invitation
// always mints a new account — so it's a dead end, and letting it sign in would
// land it on the PRIMARY household, whose reads aren't gated by role (#230).
describe('sign-in with no household', () => {
  it('refuses an account whose last membership is gone', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    await caller(db, { role: 'owner', userId: owner.id }).c.auth.setPassword({ newPassword: PW })

    const now = new Date()
    const orphan = newId()
    await db.insert(user).values({
      id: orphan,
      username: 'orphan',
      displayName: 'Orphan',
      passwordHash: await hashPassword(PW),
      createdAt: now,
      updatedAt: now,
    })

    const attempt = caller(db)
    await expect(attempt.c.auth.login({ username: 'orphan', password: PW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('no longer belongs to any household'),
    })
    // No session was minted — in particular not one pointed at the primary
    // household, which is where `defaultHouseholdFor` would have put it.
    expect(attempt.cookies).toHaveLength(0)
    expect(await db.select().from(session).where(eq(session.userId, orphan))).toHaveLength(0)

    // A real member still signs in.
    await expect(caller(db).c.auth.login({ username: 'owner', password: PW })).resolves.toMatchObject({ ok: true })
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
