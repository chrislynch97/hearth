import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { membership, user } from '../db/schema'
import { getInstanceSettings, setInstanceOwnerId } from '../db/instanceSettings'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { newId } from '../../shared/ids'
import { hashPassword } from './password'
import { getOwnerUser, isInstanceLocked, isInstanceOwner, syncAuthRequired } from './session'


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
    const now = Date.now()
    await db.insert(user).values({ id: viewerId, username: 'v', displayName: 'V', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: viewerId,
      householdId: DEFAULT_HOUSEHOLD_ID,
      role: 'viewer',
      acceptedAt: now,
      createdAt: 0, // earlier than the seeded owner grant
      updatedAt: now,
    })

    expect((await getOwnerUser(db))?.id).toBe(owner.id)
    expect(await isInstanceOwner(db, viewerId)).toBe(false)
    expect(await isInstanceOwner(db, owner.id)).toBe(true)
  })

  it('ignores an unaccepted owner grant when deriving (no stored id yet)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!

    // Clear the stored id to force the derive path, then add a second, UNACCEPTED
    // owner grant. Derivation must skip it and still return the accepted owner.
    await setInstanceOwnerId(db, null)
    const pendingId = newId()
    const now = Date.now()
    await db.insert(user).values({ id: pendingId, username: 'p', displayName: 'P', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: pendingId,
      householdId: DEFAULT_HOUSEHOLD_ID,
      role: 'owner',
      invitedAt: now,
      acceptedAt: null,
      createdAt: 0, // earlier, but not accepted
      updatedAt: now,
    })

    expect((await getOwnerUser(db))?.id).toBe(owner.id)
  })
})
