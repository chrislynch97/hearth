import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from './router'
import { resolveIdentity } from './context'
import { user } from '../db/schema'
import { hashPassword } from '../auth/password'
import { createSession, getOwnerUser, syncAuthRequired } from '../auth/session'
import type { DB } from '../db/client'

/** Lock the instance (give the owner a password) via the real sync path. */
async function lock(db: DB): Promise<string> {
  const owner = (await getOwnerUser(db))!
  await db.update(user).set({ passwordHash: await hashPassword('correct-horse-staple') }).where(eq(user.id, owner.id))
  await syncAuthRequired(db)
  return owner.id
}

function caller(db: DB, ctx: { userId?: string; role?: string; sessionToken?: string } = {}) {
  return appRouter.createCaller({ db, householdId: 'household', ...ctx })
}

// In-band, fail-closed authorization (issue #17, weakness #3): protected
// procedures must reject an unauthenticated request from INSIDE tRPC, not rely
// solely on the outer HTTP gate's URL parsing. These exercise the
// `enforceAuthenticated` middleware directly through createCaller (which never
// touches that gate).
describe('in-band auth middleware', () => {
  it('blocks a protected QUERY on a locked instance with no identity', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lock(db)

    // No userId, no session — the only thing that used to "authorize" this was a
    // role string the HTTP layer never set for an anonymous caller.
    await expect(caller(db).categories.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('blocks a protected MUTATION on a locked instance with no identity', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lock(db)

    await expect(caller(db, { role: 'owner' }).categories.create({ name: 'Nope' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('still allows public procedures on a locked instance (login screen works)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lock(db)

    const status = await caller(db).auth.status()
    expect(status.passwordSet).toBe(true)
    expect(status.authenticated).toBe(false)
  })

  it('allows a protected query once a valid session is presented', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerId = await lock(db)
    const token = await createSession(db, ownerId, 'household')

    // Context carries only the session token (as the HTTP gate would leave it);
    // the middleware resolves it to a live session and lets the call through.
    await expect(caller(db, { sessionToken: token, userId: ownerId, role: 'owner' }).categories.list()).resolves.toEqual(
      [],
    )
    // …and even without a pre-resolved userId, the token alone suffices.
    await expect(caller(db, { sessionToken: token }).categories.list()).resolves.toEqual([])
  })

  it('leaves an OPEN instance working with no login (owner fallback)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    // Not locked. A caller with the owner identity (as the open-instance fallback
    // supplies) reads freely.
    const ownerId = (await getOwnerUser(db))!.id
    await expect(caller(db, { userId: ownerId, role: 'owner' }).categories.list()).resolves.toEqual([])
  })
})

// Context resolution (issue #17, weaknesses #1 & #2): the owner fallback must
// only fire on an OPEN instance, so a locked instance never hands owner identity
// to an unauthenticated request even if the outer HTTP gate is bypassed.
describe('resolveIdentity owner fallback', () => {
  it('resolves an OPEN instance with no session as the owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerId = (await getOwnerUser(db))!.id

    const identity = await resolveIdentity(db, undefined, undefined)
    expect(identity.userId).toBe(ownerId)
    expect(identity.role).toBe('owner')
  })

  it('resolves a LOCKED instance with no session as anonymous (no owner takeover)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lock(db)

    const identity = await resolveIdentity(db, undefined, undefined)
    expect(identity.userId).toBeUndefined()
    expect(identity.role).toBeUndefined()
  })

  it('resolves a LOCKED instance to the session user when a valid session is present', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerId = await lock(db)
    const token = await createSession(db, ownerId, 'household')

    const identity = await resolveIdentity(db, token, undefined)
    expect(identity.userId).toBe(ownerId)
    expect(identity.role).toBe('owner')
  })
})
