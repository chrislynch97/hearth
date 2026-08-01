import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { getOwnerUser } from '../../auth/session'
import { hashToken, newBearerToken } from '../../auth/bearer'
import { auditLog, invitation, member, membership } from '../../db/schema'
import { newId } from '../../../shared/ids'
import type { DB } from '../../db/client'

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
const ORIGIN = 'https://hearth.example.com'

/** Run `work` with email configured to the `log` transport, and hand it the
 *  lines that were printed — so the template and link-builder are exercised for
 *  real and the emitted link can be read back out. */
async function withMail(work: (logged: string[]) => Promise<void>) {
  const logged: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
  process.env.HEARTH_MAIL_TRANSPORT = 'log'
  process.env.HEARTH_MAIL_FROM = 'Hearth <hearth@example.com>'
  process.env.HEARTH_PUBLIC_URL = ORIGIN
  try {
    await work(logged)
  } finally {
    spy.mockRestore()
    delete process.env.HEARTH_MAIL_TRANSPORT
    delete process.env.HEARTH_MAIL_FROM
    delete process.env.HEARTH_PUBLIC_URL
  }
}

/** Insert an invitation row directly so we can control its expiry/accepted state
 *  — the create procedure always stamps a fresh 7-day, unaccepted token. Returns
 *  the raw token (to present to info/accept) and the opaque row id (to list/revoke
 *  by); the row stores only the token's hash, matching production. */
async function seedInvite(db: DB, over: Partial<typeof invitation.$inferInsert> = {}) {
  const now = new Date()
  const id = newId()
  const token = newBearerToken()
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

/** Insert a person member so invite-linking can target one. Unlinked by default. */
async function seedMember(db: DB, over: Partial<typeof member.$inferInsert> = {}) {
  const now = new Date()
  const id = newId()
  await db.insert(member).values({
    id,
    householdId: 'household',
    kind: 'person',
    displayName: 'Alex',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...over,
  })
  return id
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

// httpBatchLink sends a query's input in the URL, and Fastify logs the URL — so a
// token-bearing query writes a live 7-day credential to a plaintext log (#176).
// Both token procedures are mutations so the token stays in the POST body. Pin
// the shape here: reverting `info` to `.query()` would reintroduce the leak while
// every behavioural test above still passed.
describe('procedures that take an invite token', () => {
  it.each(['invitations.info', 'invitations.accept'])('%s is a mutation', (path) => {
    const proc = appRouter._def.procedures[path as keyof typeof appRouter._def.procedures]
    expect((proc as unknown as { _def: { type: string } })._def.type).toBe('mutation')
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

describe('invitations — member linking (#82)', () => {
  it('ties a valid unlinked person member to the invite and surfaces it in list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const memberId = await seedMember(db, { displayName: 'Partner' })

    const admin = caller(db, { role: 'owner', userId: owner!.id })
    await admin.c.invitations.create({ role: 'member', memberId })

    const [row] = await db.select().from(invitation).where(eq(invitation.memberId, memberId))
    expect(row?.memberId).toBe(memberId)

    const listed = await admin.c.invitations.list()
    expect(listed[0]).toMatchObject({ memberId, memberName: 'Partner' })
  })

  it('rejects a member that is missing, joint, archived, or already linked', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const admin = caller(db, { role: 'owner', userId: owner!.id })

    await expect(admin.c.invitations.create({ role: 'member', memberId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    const [joint] = await db.select().from(member).where(eq(member.kind, 'joint'))
    await expect(admin.c.invitations.create({ role: 'member', memberId: joint!.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    const archived = await seedMember(db, { archivedAt: new Date() })
    await expect(admin.c.invitations.create({ role: 'member', memberId: archived })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    const linked = await seedMember(db, { userId: owner!.id })
    await expect(admin.c.invitations.create({ role: 'member', memberId: linked })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('auto-links the tied member to the new account on acceptance', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const memberId = await seedMember(db)
    const { token } = await seedInvite(db, { memberId })

    await caller(db, { clientKey: 'link' }).c.invitations.accept({
      token,
      username: 'alex',
      displayName: 'Alex',
      password: 'a-strong-password',
    })

    const [m] = await db.select().from(member).where(eq(member.id, memberId))
    expect(m?.userId).not.toBeNull()
    // The linked user is a real member of the household.
    const [grant] = await db.select().from(membership).where(eq(membership.userId, m!.userId!))
    expect(grant).toBeTruthy()
  })

  it('falls back to no-link when the tied member was removed before acceptance', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const memberId = await seedMember(db)
    const { id, token } = await seedInvite(db, { memberId })

    // Member deleted between creation and acceptance: FK nulls invitation.memberId.
    await db.delete(member).where(eq(member.id, memberId))
    const [row] = await db.select().from(invitation).where(eq(invitation.id, id))
    expect(row?.memberId).toBeNull()

    // Acceptance still succeeds; nothing to link.
    const res = await caller(db, { clientKey: 'gone' }).c.invitations.accept({
      token,
      username: 'alex',
      displayName: 'Alex',
      password: 'a-strong-password',
    })
    expect(res).toEqual({ ok: true })
  })
})

describe('invite by email (#111)', () => {
  it('emails the link, and returns the same token so copy-a-link still works', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await withMail(async (logged) => {
      const res = await caller(db, { role: 'owner' }).c.invitations.create({
        role: 'member',
        email: 'them@example.com',
      })
      expect(res.emailed).toBe(true)

      const mail = logged.join('\n')
      expect(mail).toContain('to: them@example.com')
      // The token rides in the fragment, never the path (#176).
      expect(mail).toContain(`${ORIGIN}/invite#${res.token}`)
    })
  })

  it('still mints a working invite when email is off', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const res = await caller(db, { role: 'owner' }).c.invitations.create({
      role: 'member',
      email: 'them@example.com',
    })
    expect(res.emailed).toBe(false)

    const info = await caller(db).c.invitations.info({ token: res.token })
    expect(info).toMatchObject({ role: 'member' })
  })

  it('sends nothing when no address was given', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await withMail(async (logged) => {
      const res = await caller(db, { role: 'owner' }).c.invitations.create({ role: 'viewer' })
      expect(res.emailed).toBe(false)
      expect(logged.join('\n')).not.toContain('/invite#')
    })
  })
})

describe('invitations.resend (#197)', () => {
  it('re-mails the address on the row, rotating the link but keeping the invitation', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { id, token } = await seedInvite(db, { role: 'viewer', email: 'them@example.com' })

    await withMail(async (logged) => {
      const before = Date.now()
      const res = await caller(db, { role: 'admin' }).c.invitations.resend({ id })
      expect(res).toMatchObject({ role: 'viewer', emailed: true })
      expect(res.token).not.toBe(token)
      // The clock restarts, so the invitee gets a full window from this mail.
      expect(res.expiresAt.getTime() - before).toBeGreaterThan(6.9 * DAY_MS)

      const mail = logged.join('\n')
      expect(mail).toContain('to: them@example.com')
      expect(mail).toContain(`${ORIGIN}/invite#${res.token}`)

      // Same invitation, new link: the old token is dead, the new one works.
      expect(await caller(db).c.invitations.info({ token })).toBeNull()
      expect(await caller(db).c.invitations.info({ token: res.token })).toMatchObject({ role: 'viewer' })
      const listed = await caller(db, { role: 'admin' }).c.invitations.list()
      expect(listed.map((r) => r.id)).toEqual([id])
    })
  })

  it('records an invite_emailed entry marked as a resend', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const { id } = await seedInvite(db, { email: 'them@example.com' })

    await withMail(async () => {
      await caller(db, { role: 'admin', userId: owner!.id }).c.invitations.resend({ id })
    })

    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'invite_emailed'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entityType: 'invitation', entityId: id, actorUserId: owner!.id })
    expect(JSON.parse(rows[0]!.changes!).details).toMatchObject({
      email: 'them@example.com',
      resent: true,
      emailed: true,
    })
    // The token is never written to the trail (issue #49).
    expect(rows[0]!.changes).not.toContain('invite#')
  })

  it('refuses an invite with no address, an accepted one, and an expired one', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const linkOnly = await seedInvite(db)
    const accepted = await seedInvite(db, { email: 'a@example.com', acceptedAt: new Date() })
    const expired = await seedInvite(db, { email: 'e@example.com', expiresAt: new Date(Date.now() - DAY_MS) })

    await withMail(async (logged) => {
      const admin = caller(db, { role: 'admin' })
      await expect(admin.c.invitations.resend({ id: linkOnly.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(admin.c.invitations.resend({ id: accepted.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(admin.c.invitations.resend({ id: expired.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(admin.c.invitations.resend({ id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(logged.join('\n')).not.toContain('/invite#')
    })

    // A refusal leaves every token exactly as it was.
    expect(await caller(db).c.invitations.info({ token: linkOnly.token })).not.toBeNull()
  })

  it('needs admin, and needs mail to be configured', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { id } = await seedInvite(db, { email: 'them@example.com' })

    // Role is checked first: a member is refused whether or not mail is on.
    await expect(caller(db, { role: 'member' }).c.invitations.resend({ id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller(db, { role: 'admin' }).c.invitations.resend({ id })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('caps resends per invitation, without capping other invitations', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const flooded = await seedInvite(db, { email: 'them@example.com' })
    const other = await seedInvite(db, { email: 'other@example.com' })

    await withMail(async () => {
      const admin = caller(db, { role: 'admin' })
      for (let i = 0; i < 3; i++) {
        await expect(admin.c.invitations.resend({ id: flooded.id })).resolves.toMatchObject({ emailed: true })
      }
      await expect(admin.c.invitations.resend({ id: flooded.id })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
      // The cap is per invitation, so the other one is unaffected.
      await expect(admin.c.invitations.resend({ id: other.id })).resolves.toMatchObject({ emailed: true })
    })
  })
})
