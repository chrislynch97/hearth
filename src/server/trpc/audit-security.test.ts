import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from './router'
import { getOwnerUser } from '../auth/session'
import { auditLog, membership, user } from '../db/schema'
import { hashPassword } from '../auth/password'
import { generateTotp } from '../auth/totp'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

// Security / access-control audit events (issue #49). The write side stages via
// recordSecurityEvent / writeSecurityEvent; here we drive the resolvers and read
// the raw audit_log rows back to assert what landed (and, crucially, what didn't
// — never a password, hash, code or token).

const PW = 'correct-horse-staple'

function caller(db: DB, opts: { role?: string; userId?: string; sessionToken?: string; sessionId?: string } = {}) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    sessionId: opts.sessionId,
    sessionToken: opts.sessionToken,
    clientKey: 'test',
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

async function ownerId(db: DB): Promise<string> {
  return (await getOwnerUser(db))!.id
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

interface Parsed {
  action: string
  entityType: string
  entityId: string
  actorUserId: string | null
  actorLabel: string | null
  householdId: string
  changes: { kind: string; details?: Record<string, unknown>; fields?: Record<string, unknown> }
}

/** Every audit row, parsed, across all households. */
async function allEvents(db: DB): Promise<Parsed[]> {
  const rows = await db.select().from(auditLog)
  return rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }) as unknown as Parsed)
}

async function eventsWithAction(db: DB, action: string): Promise<Parsed[]> {
  return (await allEvents(db)).filter((e) => e.action === action)
}

describe('access-control audit events (issue #49)', () => {
  it('records a role change with before/after role and the target, actored by the admin', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const ben = await addMember(db, 'ben', 'member')

    await caller(db, { role: 'owner', userId: owner }).c.access.setRole({ userId: ben, role: 'viewer' })

    const [ev] = await eventsWithAction(db, 'role_changed')
    expect(ev).toMatchObject({ entityType: 'membership', entityId: ben, actorUserId: owner })
    expect(ev!.changes.kind).toBe('event')
    expect(ev!.changes.details).toEqual({ member: 'ben', from: 'member', to: 'viewer' })
  })

  it('records access removal', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const ben = await addMember(db, 'ben', 'member')

    await caller(db, { role: 'owner', userId: owner }).c.access.remove({ userId: ben })

    const [ev] = await eventsWithAction(db, 'access_removed')
    expect(ev).toMatchObject({ entityType: 'membership', entityId: ben, actorUserId: owner })
    expect(ev!.changes.details).toEqual({ member: 'ben', role: 'member' })
  })

  it('records a password reset without ever storing the new password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const ben = await addMember(db, 'ben', 'member')

    const secret = 'super-secret-new-pw-9!'
    await caller(db, { role: 'owner', userId: owner }).c.access.resetPassword({ userId: ben, newPassword: secret })

    const [ev] = await eventsWithAction(db, 'password_reset')
    expect(ev).toMatchObject({ entityType: 'user', entityId: ben, actorUserId: owner })
    expect(ev!.changes.details).toEqual({ member: 'ben', mfaCleared: false })
    // The password must not leak into the trail in any form.
    expect(JSON.stringify(ev!.changes)).not.toContain(secret)
  })

  it('records an MFA clear alongside the reset that caused it (issue #51)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const ben = await addMember(db, 'ben', 'member')
    await db.update(user).set({ mfaSecret: 'SECRET', mfaEnabledAt: new Date() }).where(eq(user.id, ben))

    await caller(db, { role: 'owner', userId: owner }).c.access.resetPassword({
      userId: ben,
      newPassword: 'super-secret-new-pw-9!',
      clearMfa: true,
    })

    const [reset] = await eventsWithAction(db, 'password_reset')
    expect(reset!.changes.details).toMatchObject({ mfaCleared: true })
    const [disabled] = await eventsWithAction(db, 'mfa_disabled')
    expect(disabled).toMatchObject({ entityType: 'user', entityId: ben, actorUserId: owner })
    expect(disabled!.changes.details).toEqual({ member: 'ben', via: 'admin_reset' })
    // The TOTP secret is a credential — the trail records the event, not the value.
    expect(JSON.stringify(disabled!.changes)).not.toContain('SECRET')
  })

  it('records nothing about MFA when clearMfa is asked for but MFA was never on', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const ben = await addMember(db, 'ben', 'member')

    await caller(db, { role: 'owner', userId: owner }).c.access.resetPassword({
      userId: ben,
      newPassword: 'super-secret-new-pw-9!',
      clearMfa: true,
    })

    expect(await eventsWithAction(db, 'mfa_disabled')).toHaveLength(0)
  })
})

describe('invitation audit events (issue #49)', () => {
  it('records invite creation with role/email but never the token', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    const res = await caller(db, { role: 'owner', userId: owner }).c.invitations.create({
      role: 'member',
      email: 'ben@example.com',
    })

    const [ev] = await eventsWithAction(db, 'invite_created')
    expect(ev).toMatchObject({ entityType: 'invitation', actorUserId: owner })
    expect(ev!.changes.details).toEqual({ role: 'member', email: 'ben@example.com', memberId: null })
    expect(JSON.stringify(ev!.changes)).not.toContain(res.token)
  })

  it('records invite revocation', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    const create = caller(db, { role: 'owner', userId: owner }).c

    // Find the created invite id from the list, then revoke it.
    await create.invitations.create({ role: 'viewer', email: null })
    const [pending] = await create.invitations.list()
    await create.invitations.revoke({ id: pending!.id })

    const [ev] = await eventsWithAction(db, 'invite_revoked')
    expect(ev).toMatchObject({ entityType: 'invitation', entityId: pending!.id, actorUserId: owner })
    expect(ev!.changes.details).toMatchObject({ role: 'viewer' })
  })

  it('records invite acceptance in the joined household, actored by the new member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    const { token } = await caller(db, { role: 'owner', userId: owner }).c.invitations.create({
      role: 'member',
      email: null,
    })
    await caller(db).c.invitations.accept({
      token,
      username: 'newbie',
      displayName: 'New Bie',
      password: PW,
    })

    const [ev] = await eventsWithAction(db, 'invite_accepted')
    const newUser = (await db.select().from(user).where(eq(user.username, 'newbie')))[0]!
    expect(ev).toMatchObject({
      entityType: 'membership',
      entityId: newUser.id,
      actorUserId: newUser.id,
      householdId: 'household',
    })
    expect(ev!.changes.details).toEqual({ member: 'New Bie', role: 'member', linkedMemberId: null })
  })
})

describe('profile audit events (issue #49)', () => {
  it('records only the changed profile fields, never credential columns', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    await caller(db, { role: 'owner', userId: owner }).c.users.updateProfile({ displayName: 'Renamed Owner' })

    const rows = (await allEvents(db)).filter((e) => e.entityType === 'user' && e.action === 'update')
    expect(rows.length).toBe(1)
    const fields = rows[0]!.changes.fields as Record<string, unknown>
    expect(Object.keys(fields)).toEqual(['displayName'])
    expect(JSON.stringify(rows[0]!.changes)).not.toContain('passwordHash')
    expect(JSON.stringify(rows[0]!.changes)).not.toContain('mfaSecret')
  })
})

describe('auth audit events (issue #49)', () => {
  it('records setting the owner password (never the password itself)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    await caller(db, { role: 'owner', userId: owner }).c.auth.setPassword({ newPassword: PW })

    const [ev] = await eventsWithAction(db, 'password_changed')
    expect(ev).toMatchObject({ entityType: 'user', entityId: owner, actorUserId: owner })
    expect(ev!.changes.details).toEqual({ firstTime: true })
    expect(JSON.stringify(ev!.changes)).not.toContain(PW)
  })

  it('records a successful sign-in against the landing household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    await caller(db, { role: 'owner', userId: owner }).c.auth.setPassword({ newPassword: PW })

    await caller(db).c.auth.login({ username: 'owner', password: PW })

    const [ev] = await eventsWithAction(db, 'login')
    expect(ev).toMatchObject({ entityType: 'auth', entityId: owner, actorUserId: owner, householdId: 'household' })
    expect(ev!.changes.details).toEqual({ mfa: false })
  })

  it('records a failed sign-in against a real account with no actor, never the password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    await caller(db, { role: 'owner', userId: owner }).c.auth.setPassword({ newPassword: PW })

    await expect(caller(db).c.auth.login({ username: 'owner', password: 'wrong-password' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    const [ev] = await eventsWithAction(db, 'login_failed')
    expect(ev).toMatchObject({ entityType: 'auth', entityId: owner, actorUserId: null })
    expect(ev!.changes.details).toEqual({ username: 'owner', reason: 'bad_password' })
    expect(JSON.stringify(ev!.changes)).not.toContain('wrong-password')
  })

  it('does not record a failed sign-in for an unknown username', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)
    await caller(db, { role: 'owner', userId: owner }).c.auth.setPassword({ newPassword: PW })

    await expect(caller(db).c.auth.login({ username: 'ghost', password: 'whatever' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    expect(await eventsWithAction(db, 'login_failed')).toEqual([])
  })

  it('records a logout only for a real session', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    // A logout carrying a live session id is recorded...
    await caller(db, { userId: owner, sessionId: 'sess-1' }).c.auth.logout()
    const logouts = await eventsWithAction(db, 'logout')
    expect(logouts.length).toBe(1)
    expect(logouts[0]).toMatchObject({ entityType: 'auth', entityId: owner, actorUserId: owner })

    // ...but the owner-fallback identity on an open instance (no session) is not.
    await caller(db, { userId: owner }).c.auth.logout()
    expect((await eventsWithAction(db, 'logout')).length).toBe(1)
  })

  it('records toggling open registration', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    await caller(db, { role: 'owner', userId: owner }).c.auth.setRegistrationOpen({ open: true })

    const [ev] = await eventsWithAction(db, 'registration_changed')
    expect(ev).toMatchObject({ entityType: 'instance', actorUserId: owner })
    expect(ev!.changes.details).toEqual({ open: true })
  })

  it('records the MFA lifecycle (enrol → enable → disable) without secrets or codes', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    // setPassword locks the instance, so subsequent calls must carry the session
    // cookie it issued.
    const setup = caller(db, { role: 'owner', userId: owner })
    await setup.c.auth.setPassword({ newPassword: PW })
    const token = setup.cookies.at(-1) as string
    const authed = caller(db, { role: 'owner', userId: owner, sessionToken: token })

    const { secret } = await authed.c.auth.enrollMfa()
    await authed.c.auth.confirmMfa({ code: generateTotp(secret) })
    // Confirming revokes every session and re-issues one (#50), so carry on
    // through the cookie it just handed back.
    const reissued = caller(db, { role: 'owner', userId: owner, sessionToken: authed.cookies.at(-1) as string })
    await reissued.c.auth.disableMfa({ currentPassword: PW })

    expect((await eventsWithAction(db, 'mfa_enroll_started'))[0]!.changes.details).toEqual({ reenroll: false })
    expect((await eventsWithAction(db, 'mfa_enabled')).length).toBe(1)
    expect((await eventsWithAction(db, 'mfa_disabled')).length).toBe(1)
    // The TOTP secret must never appear in any recorded event.
    const dump = JSON.stringify(await allEvents(db))
    expect(dump).not.toContain(secret)
  })

  it('does not record disabling MFA when it was already off', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await ownerId(db)

    const setup = caller(db, { role: 'owner', userId: owner })
    await setup.c.auth.setPassword({ newPassword: PW })
    const token = setup.cookies.at(-1) as string
    await caller(db, { role: 'owner', userId: owner, sessionToken: token }).c.auth.disableMfa({ currentPassword: PW })

    expect(await eventsWithAction(db, 'mfa_disabled')).toEqual([])
  })
})
