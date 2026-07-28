import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLog } from '../db/schema'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { createSession, getOwnerUser, getValidSession, listUserSessions } from '../auth/session'
import { hashToken } from '../auth/bearer'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import type { DB } from '../db/client'

// sessions.list / revoke / revokeOthers (issue #50): a user seeing and ending
// their own logins, without having to change their password to do it.

const PW = 'correct-horse-staple'

function caller(db: DB, opts: { userId?: string; sessionToken?: string; sessionId?: string } = {}) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: DEFAULT_HOUSEHOLD_ID,
    role: 'owner',
    userId: opts.userId,
    sessionId: opts.sessionId,
    sessionToken: opts.sessionToken,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

/** Lock the instance and return the owner plus a caller on a real session. */
async function lockedOwner(db: DB) {
  const owner = (await getOwnerUser(db))!
  const setup = caller(db, { userId: owner.id })
  await setup.c.auth.setPassword({ newPassword: PW })
  const token = setup.cookies.at(-1) as string
  return { owner, token, sessionId: hashToken(token) }
}

describe('sessions.list', () => {
  it('lists the caller’s live sessions and flags the current one', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID, { userAgent: 'Firefox', ip: '192.168.1.9' })

    const rows = await caller(db, { userId: owner.id, sessionToken: token, sessionId }).c.sessions.list()
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.current)).toHaveLength(1)
    expect(rows.map((r) => r.userAgent)).toContain('Firefox')
    expect(rows.map((r) => r.ip)).toContain('192.168.1.9')
  })

  it('never exposes the session id — it is the hash the cookie resolves to', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)

    const rows = await caller(db, { userId: owner.id, sessionToken: token, sessionId }).c.sessions.list()
    // Shipping the row id would undo hashing tokens at rest (#47): it's exactly
    // the value a database-level lookup keys on.
    const dump = JSON.stringify(rows)
    expect(dump).not.toContain(sessionId)
    expect(dump).not.toContain(token)
  })

  it('shows only the caller’s own sessions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)

    // Another user's session must not appear — there is deliberately no
    // cross-user visibility here, not even for the instance owner.
    const other = await addUser(db, 'ben')
    await createSession(db, other, DEFAULT_HOUSEHOLD_ID)

    const rows = await caller(db, { userId: owner.id, sessionToken: token, sessionId }).c.sessions.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.current).toBe(true)
  })

  it('rejects an unauthenticated caller', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lockedOwner(db)
    await expect(caller(db).c.sessions.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('sessions.revoke', () => {
  it('ends another of the caller’s sessions and leaves the current one alone', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    const strangerToken = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    const rows = await me.c.sessions.list()
    const target = rows.find((r) => !r.current)!

    expect(await me.c.sessions.revoke({ ref: target.ref })).toEqual({ ok: true, count: 1, endedCurrent: false })
    expect(await getValidSession(db, strangerToken)).toBeNull()
    expect(await getValidSession(db, token)).not.toBeNull()
  })

  it('revoking the current session logs the caller out and clears the cookie', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)

    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    const current = (await me.c.sessions.list()).find((r) => r.current)!
    expect(await me.c.sessions.revoke({ ref: current.ref })).toMatchObject({ endedCurrent: true })

    expect(await getValidSession(db, token)).toBeNull()
    expect(me.cookies.at(-1)).toBeNull() // cookie cleared, as on logout
  })

  it('cannot revoke another user’s session', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    const other = await addUser(db, 'ben')
    const theirToken = await createSession(db, other, DEFAULT_HOUSEHOLD_ID)

    // The owner's own list has one entry, so ref '1' can only mean someone
    // else's row if refs leaked across users. It must not resolve.
    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    await expect(me.c.sessions.revoke({ ref: '1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await getValidSession(db, theirToken)).not.toBeNull()
  })

  it('rejects a ref that no longer resolves', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    await expect(me.c.sessions.revoke({ ref: '99' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(me.c.sessions.revoke({ ref: 'nonsense' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('sessions.revokeOthers', () => {
  it('ends every other session and keeps the caller signed in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    const a = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const b = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    expect(await me.c.sessions.revokeOthers()).toEqual({ ok: true, count: 2 })

    expect(await getValidSession(db, a)).toBeNull()
    expect(await getValidSession(db, b)).toBeNull()
    expect(await getValidSession(db, token)).not.toBeNull()
    expect(me.cookies).toHaveLength(0) // the caller's own cookie is untouched
  })

  it('leaves other users’ sessions alone', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    const other = await addUser(db, 'ben')
    const theirToken = await createSession(db, other, DEFAULT_HOUSEHOLD_ID)

    await caller(db, { userId: owner.id, sessionToken: token, sessionId }).c.sessions.revokeOthers()
    expect(await getValidSession(db, theirToken)).not.toBeNull()
  })

  it('refuses when the caller has no session of their own to keep', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    // An open instance resolves an ambient owner identity with no session — there
    // is no "this device", so signing out everything else is not well defined.
    const stray = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    await expect(caller(db, { userId: owner.id }).c.sessions.revokeOthers()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(await getValidSession(db, stray)).not.toBeNull()
  })
})

describe('sessions audit trail', () => {
  it('records a revocation as a security event', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    const me = caller(db, { userId: owner.id, sessionToken: token, sessionId })
    await me.c.sessions.revokeOthers()

    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'sessions_revoked'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actorUserId).toBe(owner.id)
    expect(JSON.parse(rows[0]!.changes ?? '{}')).toEqual({ kind: 'event', details: { count: 1, scope: 'others' } })
  })
})

/** An extra accepted member of the default household; returns its user id. */
async function addUser(db: DB, username: string): Promise<string> {
  const { createUserWithMembership } = await import('../auth/session')
  return createUserWithMembership(db, {
    username,
    displayName: username,
    email: null,
    passwordHash: 'x',
    householdId: DEFAULT_HOUSEHOLD_ID,
    role: 'member',
  })
}

// Guards the invariant the router depends on: list() and revoke() must derive
// refs from the same ordering, or a ref would revoke the wrong row.
describe('ref stability', () => {
  it('list refs index into listUserSessions’ own ordering', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { owner, token, sessionId } = await lockedOwner(db)
    await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    const rows = await caller(db, { userId: owner.id, sessionToken: token, sessionId }).c.sessions.list()
    const raw = await listUserSessions(db, owner.id)
    expect(rows.map((r) => r.ref)).toEqual(raw.map((_, i) => String(i)))
    expect(rows.map((r) => r.lastSeenAt.getTime())).toEqual(raw.map((s) => s.lastSeenAt.getTime()))
  })
})
