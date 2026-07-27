import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { membership, session, user } from '../db/schema'
import { getInstanceSettings, setInstanceOwnerId } from '../db/instanceSettings'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { newId } from '../../shared/ids'
import { hashPassword } from './password'
import { hashToken } from './bearer'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  createSession,
  deleteExpiredSessions,
  deleteOtherUserSessions,
  deleteUserSessionById,
  getOwnerUser,
  getValidSession,
  isInstanceLocked,
  isInstanceOwner,
  listUserSessions,
  syncAuthRequired,
  touchSession,
} from './session'


describe('instance owner / lock resolution', () => {
  it('ensureSeed backfills the explicit owner id and an unlocked (open) instance', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const owner = await getOwnerUser(db)
    const settings = await getInstanceSettings(db)
    expect(settings.ownerUserId).toBe(owner!.id)
    expect(settings.authRequired).toBe(false)
    expect(await isInstanceLocked(db)).toBe(false)
  })

  it('a locked instance stays locked even when the magic-household owner grant no longer resolves', async () => {
    // Reproduces the reported fail-open: owner identity + lock used to be inferred
    // from the magic household id (`DEFAULT_HOUSEHOLD_ID`), so a db restored or
    // re-provisioned under a different id resolved to "no owner" and fell open.
    // With an explicit owner id + persisted lock flag, neither depends on the
    // grant under that magic id any more.
    const db = await makeTestDb()
    await ensureSeed(db)

    // Lock the instance (owner sets a password) via the real sync path.
    const owner = (await getOwnerUser(db))!
    await db.update(user).set({ passwordHash: await hashPassword('correct-horse-staple') }).where(eq(user.id, owner.id))
    await syncAuthRequired(db)
    expect(await isInstanceLocked(db)).toBe(true)

    // Drop every membership under the magic household id — as if the primary
    // household were restored/re-provisioned under a random id. The old
    // magic-id derivation would now find no owner and read the instance as open.
    await db.delete(membership).where(eq(membership.householdId, DEFAULT_HOUSEHOLD_ID))

    // The instance must NOT fall open, and the owner still resolves via the id
    // persisted in instance_settings rather than the (now absent) grant.
    expect(await isInstanceLocked(db)).toBe(true)
    expect((await getOwnerUser(db))?.id).toBe(owner.id)
    expect(await isInstanceOwner(db, owner.id)).toBe(true)
  })

  it('resolves the owner grant, not an arbitrary earlier membership, as instance owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    // A viewer added to the primary household with an earlier createdAt than the
    // owner grant — the old unordered/unfiltered fallback could have picked them.
    const viewerId = newId()
    const now = new Date()
    await db.insert(user).values({ id: viewerId, username: 'v', displayName: 'V', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: viewerId,
      householdId: DEFAULT_HOUSEHOLD_ID,
      role: 'viewer',
      acceptedAt: now,
      createdAt: new Date(0), // earlier than the seeded owner grant
      updatedAt: now,
    })

    expect((await getOwnerUser(db))?.id).toBe(owner.id)
    expect(await isInstanceOwner(db, viewerId)).toBe(false)
    expect(await isInstanceOwner(db, owner.id)).toBe(true)
  })

  it('purges only expired session rows, leaving live ones intact', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    // A live session and a hand-written already-expired one under the same
    // user/household.
    const liveId = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const expiredId = newId()
    const now = new Date()
    const createdAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    await db.insert(session).values({
      id: expiredId,
      userId: owner.id,
      activeHouseholdId: DEFAULT_HOUSEHOLD_ID,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(now.getTime() - 1),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    })

    await deleteExpiredSessions(db, now)

    // The expired row is gone; the live session still resolves. `liveId` is the
    // raw cookie token; the row is keyed by its hash, so compare on userId.
    expect(await db.select().from(session).where(eq(session.id, expiredId))).toHaveLength(0)
    expect((await getValidSession(db, liveId))?.userId).toBe(owner.id)
  })

  it('ignores an unaccepted owner grant when deriving (no stored id yet)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    // Clear the stored id to force the derive path, then add a second, UNACCEPTED
    // owner grant. Derivation must skip it and still return the accepted owner.
    await setInstanceOwnerId(db, null)
    const pendingId = newId()
    const now = new Date()
    await db.insert(user).values({ id: pendingId, username: 'p', displayName: 'P', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: pendingId,
      householdId: DEFAULT_HOUSEHOLD_ID,
      role: 'owner',
      invitedAt: now,
      acceptedAt: null,
      createdAt: new Date(0), // earlier, but not accepted
      updatedAt: now,
    })

    expect((await getOwnerUser(db))?.id).toBe(owner.id)
  })
})

/** The session row behind a raw cookie token, straight from the table. */
async function rowFor(db: Awaited<ReturnType<typeof makeTestDb>>, token: string) {
  return (await getValidSession(db, token))!
}

describe('session lifetime (issue #50)', () => {
  it('creates a session with a sliding idle window and a fixed absolute ceiling', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    const before = Date.now()
    const token = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const s = await rowFor(db, token)

    expect(s.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_IDLE_TTL_MS - 5_000)
    expect(s.absoluteExpiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_ABSOLUTE_TTL_MS - 5_000)
    expect(s.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 5_000)
  })

  it('records where the session was established, truncating a huge user agent', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    const token = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID, {
      userAgent: 'U'.repeat(5_000),
      ip: '192.168.1.9',
    })
    const s = await rowFor(db, token)
    expect(s.ip).toBe('192.168.1.9')
    expect(s.userAgent).toHaveLength(400) // attacker-controlled and unbounded; stored as a slice
  })

  it('slides the idle window forward when the session is used', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const token = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const s = await rowFor(db, token)

    // Two hours on: past the touch interval, so the deadline moves out with us.
    const later = Date.now() + 2 * 60 * 60 * 1000
    const moved = await touchSession(db, s, later)
    expect(moved).not.toBeNull()

    const after = await rowFor(db, token)
    expect(after.expiresAt.getTime()).toBeGreaterThan(s.expiresAt.getTime())
    expect(after.expiresAt.getTime()).toBe(later + SESSION_IDLE_TTL_MS)
    expect(after.lastSeenAt.getTime()).toBe(later)
  })

  it('skips the write when the session was seen moments ago', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const token = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const s = await rowFor(db, token)

    // Just inside the touch interval: not worth a write on every request.
    expect(await touchSession(db, s, s.lastSeenAt.getTime() + SESSION_TOUCH_INTERVAL_MS - 1)).toBeNull()
    expect((await rowFor(db, token)).expiresAt.getTime()).toBe(s.expiresAt.getTime())
  })

  it('never slides the idle window past the absolute ceiling', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const token = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const s = await rowFor(db, token)

    // Someone active on day 89: the sliding window would happily run to day 103,
    // but the cap is the whole point — it must win.
    const nearCap = s.absoluteExpiresAt.getTime() - 24 * 60 * 60 * 1000
    await touchSession(db, s, nearCap)
    const after = await rowFor(db, token)
    expect(after.expiresAt.getTime()).toBe(s.absoluteExpiresAt.getTime())
  })

  it('treats a session past its absolute ceiling as dead however recently it was used', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    // A cookie an attacker kept warm: idle window wide open, ceiling long gone.
    const token = 'kept-warm-token'
    const now = new Date()
    await db.insert(session).values({
      id: hashToken(token),
      userId: owner.id,
      activeHouseholdId: DEFAULT_HOUSEHOLD_ID,
      createdAt: new Date(now.getTime() - SESSION_ABSOLUTE_TTL_MS - 1000),
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_TTL_MS),
      absoluteExpiresAt: new Date(now.getTime() - 1),
    })

    expect(await getValidSession(db, token)).toBeNull()
    await deleteExpiredSessions(db, now)
    expect(await db.select().from(session).where(eq(session.id, hashToken(token)))).toHaveLength(0)
  })
})

describe('listing and revoking sessions (issue #50)', () => {
  it('lists a user’s live sessions, most recently active first', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    const a = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const b = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    // Make `b` the more recently active one.
    await touchSession(db, await rowFor(db, b), Date.now() + 2 * 60 * 60 * 1000)

    const rows = await listUserSessions(db, owner.id)
    expect(rows.map((s) => s.id)).toEqual([hashToken(b), hashToken(a)])
  })

  it('excludes dead sessions and other users’ sessions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    const live = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const now = new Date()
    await db.insert(session).values({
      id: hashToken('dead'),
      userId: owner.id,
      activeHouseholdId: DEFAULT_HOUSEHOLD_ID,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() - 1),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    })

    const other = newId()
    await db.insert(user).values({ id: other, username: 'o2', displayName: 'O2', createdAt: now, updatedAt: now })
    await createSession(db, other, DEFAULT_HOUSEHOLD_ID)

    expect((await listUserSessions(db, owner.id)).map((s) => s.id)).toEqual([hashToken(live)])
  })

  it('revokes one session by id, and only its owner’s', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const mine = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    const other = newId()
    const now = new Date()
    await db.insert(user).values({ id: other, username: 'o2', displayName: 'O2', createdAt: now, updatedAt: now })
    const theirs = await createSession(db, other, DEFAULT_HOUSEHOLD_ID)

    // Scoped to the owner: naming someone else's session id does nothing.
    expect(await deleteUserSessionById(db, owner.id, hashToken(theirs))).toBe(false)
    expect(await getValidSession(db, theirs)).not.toBeNull()

    expect(await deleteUserSessionById(db, owner.id, hashToken(mine))).toBe(true)
    expect(await getValidSession(db, mine)).toBeNull()
  })

  it('signs out everywhere else, keeping the caller’s own session', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const keep = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const drop1 = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const drop2 = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    expect(await deleteOtherUserSessions(db, owner.id, hashToken(keep))).toBe(2)
    expect(await getValidSession(db, keep)).not.toBeNull()
    expect(await getValidSession(db, drop1)).toBeNull()
    expect(await getValidSession(db, drop2)).toBeNull()
  })
})
