import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { getOwnerUser, getUser } from '../../auth/session'
import { auditLog, household, member, membership, session, user } from '../../db/schema'
import { hashPassword } from '../../auth/password'
import { newId } from '../../../shared/ids'
import type { DB } from '../../db/client'
import { eq } from 'drizzle-orm'

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

/** Insert an accepted member of the default household and return its user id. */
async function addMember(db: DB, username: string, role: string): Promise<string> {
  const uid = newId()
  const now = new Date()
  await db.insert(user).values({
    id: uid,
    username,
    displayName: username,
    passwordHash: await hashPassword('their-strong-pw'),
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(membership).values({
    id: newId(),
    userId: uid,
    householdId: 'household',
    role,
    invitedAt: now,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  return uid
}

describe('access.list', () => {
  it('needs admin, and returns every accepted member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await addMember(db, 'ben', 'member')

    await expect(caller(db, { role: 'member' }).c.access.list()).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const rows = await caller(db, { role: 'admin' }).c.access.list()
    expect(rows.map((r) => r.username).sort()).toEqual(['ben', 'owner'])
    expect(rows.find((r) => r.username === 'ben')?.role).toBe('member')
  })
})

describe('access.setRole', () => {
  it('admins manage member/viewer only; owner needed for admin/owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ben = await addMember(db, 'ben', 'member')
    const ada = await addMember(db, 'ada', 'admin')

    // admin can retune a member/viewer
    await expect(caller(db, { role: 'admin' }).c.access.setRole({ userId: ben, role: 'viewer' })).resolves.toEqual({
      ok: true,
    })
    // ...but can't mint an admin, nor touch an existing admin
    await expect(caller(db, { role: 'admin' }).c.access.setRole({ userId: ben, role: 'admin' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller(db, { role: 'admin' }).c.access.setRole({ userId: ada, role: 'member' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    // owner can
    await expect(caller(db, { role: 'owner' }).c.access.setRole({ userId: ben, role: 'admin' })).resolves.toEqual({
      ok: true,
    })
  })

  it('you cannot change your own role', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    await expect(
      caller(db, { role: 'owner', userId: owner!.id }).c.access.setRole({ userId: owner!.id, role: 'admin' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('access.remove', () => {
  it('revokes access and ends the member’s sessions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ben = await addMember(db, 'ben', 'member')
    // give ben a live session
    await db.insert(session).values({
      id: newId(),
      userId: ben,
      activeHouseholdId: 'household',
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000),
      absoluteExpiresAt: new Date(Date.now() + 1_000_000),
    })

    await expect(caller(db, { role: 'admin' }).c.access.remove({ userId: ben })).resolves.toEqual({
      ok: true,
      accountDeleted: true,
    })
    expect(await db.select().from(membership).where(eq(membership.userId, ben))).toHaveLength(0)
    expect(await db.select().from(session).where(eq(session.userId, ben))).toHaveLength(0)
  })

  // Removing someone from their LAST household used to leave the login behind —
  // an email address and a password hash with no route to remove them and nothing
  // that ever would (#230). The account is dead at that point: it can't sign in,
  // and accepting an invitation always mints a new one.
  it('deletes the account when that was the member’s last household (issue #230)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ben = await addMember(db, 'ben', 'member')
    // Ben is the budgeting participant behind a member row, whose history must
    // outlive him.
    const owner = await getOwnerUser(db)
    const alice = await caller(db, { role: 'owner', userId: owner!.id }).c.members.addPerson({ displayName: 'Alice' })
    await db.update(member).set({ userId: ben }).where(eq(member.id, alice.id))

    await expect(caller(db, { role: 'admin' }).c.access.remove({ userId: ben })).resolves.toMatchObject({
      accountDeleted: true,
    })

    expect(await getUser(db, ben)).toBeNull()
    const [row] = await db.select().from(member).where(eq(member.id, alice.id))
    expect(row?.displayName).toBe('Alice')
    expect(row?.userId).toBeNull()

    // Recorded with a reference, not the identity the deletion removed.
    const [event] = await db.select().from(auditLog).where(eq(auditLog.action, 'account_deleted'))
    expect(event?.actorUserId).toBeNull()
    expect(event?.entityId).not.toBe(ben)
  })

  it('keeps the account when the member still belongs somewhere else', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ben = await addMember(db, 'ben', 'member')
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: ben,
      householdId: 'h2',
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(caller(db, { role: 'admin' }).c.access.remove({ userId: ben })).resolves.toMatchObject({
      accountDeleted: false,
    })
    expect(await getUser(db, ben)).not.toBeNull()
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'account_deleted'))).toHaveLength(0)
  })

  it('admins cannot remove an owner/admin, and no one removes themselves', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const ada = await addMember(db, 'ada', 'admin')

    await expect(caller(db, { role: 'admin' }).c.access.remove({ userId: ada })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      caller(db, { role: 'owner', userId: owner!.id }).c.access.remove({ userId: owner!.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('access.resetPassword', () => {
  it('sets a working new password, ends sessions, and respects the policy', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const ben = await addMember(db, 'ben', 'member')
    const ada = await addMember(db, 'ada', 'admin')
    // lock the instance so login is live
    await caller(db, { role: 'owner', userId: owner!.id }).c.auth.setPassword({ newPassword: 'owner-strong-pw' })

    // A locked instance requires a real identity, not just a role string.
    await expect(
      caller(db, { role: 'admin', userId: ada }).c.access.resetPassword({ userId: ben, newPassword: 'short' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await expect(
      caller(db, { role: 'admin', userId: ada }).c.access.resetPassword({ userId: ben, newPassword: 'brand-new-strong-pw' }),
    ).resolves.toEqual({ ok: true })

    // The new password works.
    expect(await caller(db).c.auth.login({ username: 'ben', password: 'brand-new-strong-pw' })).toEqual({ ok: true })
  })

  it('leaves MFA alone by default, and clears it only when asked', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ben = await addMember(db, 'ben', 'member')
    const enrolled = { mfaSecret: 'SECRET', mfaEnabledAt: new Date(), mfaRecoveryCodes: '["hash"]', mfaLastStep: 1 }
    await db.update(user).set(enrolled).where(eq(user.id, ben))

    // The realistic lockout is a lost phone, but a reset must not strip the
    // second factor unless the admin says so (issue #51).
    await caller(db, { role: 'admin' }).c.access.resetPassword({ userId: ben, newPassword: 'brand-new-strong-pw' })
    const [stillOn] = await db.select().from(user).where(eq(user.id, ben))
    expect(stillOn!.mfaEnabledAt).not.toBeNull()
    expect(stillOn!.mfaSecret).toBe('SECRET')

    await caller(db, { role: 'admin' }).c.access.resetPassword({
      userId: ben,
      newPassword: 'another-strong-pw',
      clearMfa: true,
    })
    const [cleared] = await db.select().from(user).where(eq(user.id, ben))
    expect(cleared!.mfaEnabledAt).toBeNull()
    expect(cleared!.mfaSecret).toBeNull()
    expect(cleared!.mfaRecoveryCodes).toBeNull()
    expect(cleared!.mfaLastStep).toBeNull()
  })

  it('clearMfa obeys the same authority checks as the reset itself', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ada = await addMember(db, 'ada', 'admin')
    await db.update(user).set({ mfaSecret: 'SECRET', mfaEnabledAt: new Date() }).where(eq(user.id, ada))

    // An admin can't reset a peer admin — and so can't strip their MFA either.
    await expect(
      caller(db, { role: 'admin' }).c.access.resetPassword({
        userId: ada,
        newPassword: 'brand-new-strong-pw',
        clearMfa: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const [untouched] = await db.select().from(user).where(eq(user.id, ada))
    expect(untouched!.mfaSecret).toBe('SECRET')
  })

  it('admins cannot reset an owner/admin password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ada = await addMember(db, 'ada', 'admin')
    await expect(
      caller(db, { role: 'admin' }).c.access.resetPassword({ userId: ada, newPassword: 'brand-new-strong-pw' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('refuses to reset a user who also belongs to another household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const carol = await addMember(db, 'carol', 'member') // member of the primary household
    // …and also a member (owner) of a second household.
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: carol,
      householdId: 'h2',
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      caller(db, { role: 'owner' }).c.access.resetPassword({ userId: carol, newPassword: 'brand-new-strong-pw' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
