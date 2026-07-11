import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getOwnerUser } from '../auth/session'
import { member, user } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'
import { eq } from 'drizzle-orm'

function caller(db: DB, opts: { role?: string; userId?: string } = {}) {
  return appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    setSessionCookie: () => {},
  })
}

describe('members.linkUser', () => {
  it('links an account to a member, one-to-one, and greets by that name', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const asOwner = caller(db, { role: 'owner', userId: owner!.id })
    const ava = await asOwner.members.addPerson({ displayName: 'Ava' })
    const ben = await asOwner.members.addPerson({ displayName: 'Ben' })

    // Link the owner account to Ava.
    await expect(asOwner.members.linkUser({ memberId: ava.id, userId: owner!.id })).resolves.toEqual({ ok: true })
    const me1 = await asOwner.users.me()
    expect(me1?.linkedMemberId).toBe(ava.id)
    expect(me1?.linkedMemberName).toBe('Ava')

    // Re-linking the same account to Ben moves it off Ava (one-to-one).
    await asOwner.members.linkUser({ memberId: ben.id, userId: owner!.id })
    const [avaRow] = await db.select().from(member).where(eq(member.id, ava.id))
    const [benRow] = await db.select().from(member).where(eq(member.id, ben.id))
    expect(avaRow?.userId).toBeNull()
    expect(benRow?.userId).toBe(owner!.id)

    // Unlink.
    await asOwner.members.linkUser({ memberId: ben.id, userId: null })
    const me2 = await asOwner.users.me()
    expect(me2?.linkedMemberId).toBeNull()
  })

  it('is admin-gated and rejects accounts outside the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const ava = await caller(db, { role: 'owner', userId: owner!.id }).members.addPerson({ displayName: 'Ava' })

    // A member (non-admin) can't link.
    await expect(caller(db, { role: 'member' }).members.linkUser({ memberId: ava.id, userId: owner!.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    // An account with no membership in this household can't be linked.
    const now = new Date()
    const outsider = newId()
    await db.insert(user).values({ id: outsider, username: 'out', displayName: 'Out', createdAt: now, updatedAt: now })
    await expect(caller(db, { role: 'owner' }).members.linkUser({ memberId: ava.id, userId: outsider })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
