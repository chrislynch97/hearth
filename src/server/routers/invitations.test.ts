import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getOwnerUser, hashToken, newSessionId } from '../auth/session'
import { invitation, membership } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

function caller(
  db: DB,
  opts: { role?: string; userId?: string; clientKey?: string } = {},
) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    clientKey: opts.clientKey,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Insert an invitation row directly so we can control its expiry/accepted state
 *  — the create procedure always stamps a fresh 7-day, unaccepted token. Returns
 *  the raw token (to present to info/accept) and the opaque row id (to list/revoke
 *  by); the row stores only the token's hash, matching production. */
async function seedInvite(db: DB, over: Partial<typeof invitation.$inferInsert> = {}) {
  const now = new Date()
  const id = newId()
  const token = newSessionId()
  await db.insert(invitation).values({
    id,
    tokenHash: hashToken(token),
    householdId: 'household',
    role: 'member',
    email: null,
    invitedByUserId: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 7 * DAY_MS),
    acceptedAt: null,
    ...over,
  })
  return { id, token }
}

describe('invitations.create', () => {
  it('mints a ~7-day token and gates admin invites to owners', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const before = Date.now()
    const res = await caller(db, { role: 'owner', userId: owner!.id }).c.invitations.create({ role: 'member' })
    expect(res.token).toBeTruthy()
    expect(res.role).toBe('member')
    const ttl = res.expiresAt.getTime() - before
    expect(ttl).toBeGreaterThan(6.9 * DAY_MS)
    expect(ttl).toBeLessThan(7.1 * DAY_MS)

    // Admins may invite members but not admins; owners may invite admins.
    await expect(caller(db, { role: 'admin' }).c.invitations.create({ role: 'admin' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      caller(db, { role: 'owner', userId: owner!.id }).c.invitations.create({ role: 'admin' }),
    ).resolves.toMatchObject({ role: 'admin' })
  })
})

describe('invitations.info', () => {
  it('describes a valid invite', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { token } = await seedInvite(db, { role: 'viewer' })

    const info = await caller(db).c.invitations.info({ token })
    expect(info).toMatchObject({ role: 'viewer' })
    expect(info?.householdName).toBeTruthy()
  })

  it('returns null for unknown, expired, and already-accepted tokens', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    expect(await caller(db).c.invitations.info({ token: 'nope' })).toBeNull()

    const expired = await seedInvite(db, { expiresAt: new Date(Date.now() - DAY_MS) })
    expect(await caller(db).c.invitations.info({ token: expired.token })).toBeNull()

    const accepted = await seedInvite(db, { acceptedAt: new Date() })
    expect(await caller(db).c.invitations.info({ token: accepted.token })).toBeNull()
  })
})

describe('invitations.list / revoke', () => {
  it('lists only pending, unexpired invites and lets an admin revoke', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const pending = await seedInvite(db, { email: 'p@example.com' })
    await seedInvite(db, { email: 'x@example.com', expiresAt: new Date(Date.now() - DAY_MS) }) // expired
    await seedInvite(db, { email: 'y@example.com', acceptedAt: new Date() }) // accepted

    const listed = await caller(db, { role: 'admin' }).c.invitations.list()
    expect(listed.map((r) => r.id)).toEqual([pending.id])

    // list must never leak the bearer token — only the opaque id is returned.
    expect(JSON.stringify(listed)).not.toContain(pending.token)

    // Non-admins can't enumerate invites.
    await expect(caller(db, { role: 'member' }).c.invitations.list()).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await caller(db, { role: 'admin' }).c.invitations.revoke({ id: pending.id })
    expect(await caller(db, { role: 'admin' }).c.invitations.list()).toHaveLength(0)
  })
})

describe('invitations.accept', () => {
  it('creates an account + membership and logs the invitee in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { id, token } = await seedInvite(db, { role: 'member' })

    const invitee = caller(db, { clientKey: 'ok' })
    const res = await invitee.c.invitations.accept({
      token,
      username: 'ben',
      displayName: 'Ben',
      password: 'a-strong-password',
    })
    expect(res).toEqual({ ok: true })
    expect(invitee.cookies.at(-1)).toBeTruthy()

    // The invite is now spent and the membership exists.
    const [inv] = await db.select().from(invitation).where(eq(invitation.id, id))
    expect(inv?.acceptedAt).not.toBeNull()
    const grants = await db.select().from(membership).where(eq(membership.householdId, 'household'))
    expect(grants.length).toBeGreaterThanOrEqual(2) // owner + ben
  })

  it('rejects an expired invite', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { token } = await seedInvite(db, { expiresAt: new Date(Date.now() - DAY_MS) })

    await expect(
      caller(db, { clientKey: 'expiry' }).c.invitations.accept({
        token,
        username: 'late',
        displayName: 'Late',
        password: 'a-strong-password',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects a second accept of an already-accepted invite', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { token } = await seedInvite(db)

    await caller(db, { clientKey: 'first' }).c.invitations.accept({
      token,
      username: 'first',
      displayName: 'First',
      password: 'a-strong-password',
    })
    await expect(
      caller(db, { clientKey: 'second' }).c.invitations.accept({
        token,
        username: 'second',
        displayName: 'Second',
        password: 'a-strong-password',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // No account was created for the losing attempt.
    const grants = await db.select().from(membership).where(eq(membership.householdId, 'household'))
    expect(grants).toHaveLength(2) // owner + first only
  })

  it('rejects a weak password and a taken username', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const weakToken = await seedInvite(db)
    await expect(
      caller(db, { clientKey: 'weak' }).c.invitations.accept({
        token: weakToken.token,
        username: 'wendy',
        displayName: 'Wendy',
        password: 'short',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const takenToken = await seedInvite(db)
    await expect(
      caller(db, { clientKey: 'taken' }).c.invitations.accept({
        token: takenToken.token,
        username: 'owner', // already the seeded owner's username
        displayName: 'Impostor',
        password: 'a-strong-password',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throttles repeated failures from one client', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const key = 'flooder'

    // Ten failed attempts (invalid token) trip the per-client limiter.
    for (let i = 0; i < 10; i++) {
      await expect(
        caller(db, { clientKey: key }).c.invitations.accept({
          token: 'bad-token',
          username: `u${i}`,
          displayName: 'U',
          password: 'a-strong-password',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }

    // The next attempt is blocked before the token is even inspected — a valid
    // token would still be refused.
    const good = await seedInvite(db)
    await expect(
      caller(db, { clientKey: key }).c.invitations.accept({
        token: good.token,
        username: 'blocked',
        displayName: 'Blocked',
        password: 'a-strong-password',
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })
})
