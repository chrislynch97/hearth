import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from './router'
import { getUserByUsername } from '../auth/session'
import { household, member, membership } from '../db/schema'
import type { DB } from '../db/client'

function caller(db: DB, opts: { role?: string; userId?: string } = {}) {
  const cookies: Array<string | null> = []
  const c = appRouter.createCaller({
    db,
    householdId: 'household',
    role: opts.role,
    userId: opts.userId,
    setSessionCookie: (t) => cookies.push(t),
  })
  return { c, cookies }
}

const REG = { username: 'nadia', displayName: 'Nadia', password: 'strong-new-pw-1', householdName: 'Nadia Home' }

describe('open registration', () => {
  it('is closed by default; only the instance owner can open it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getUserByUsername(db, 'owner')

    expect((await caller(db).c.auth.registrationOpen()).allowOpenRegistration).toBe(false)
    await expect(caller(db).c.auth.register(REG)).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // No identity → can't toggle.
    await expect(caller(db).c.auth.setRegistrationOpen({ open: true })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    // The primary-household owner can.
    await caller(db, { userId: owner!.id }).c.auth.setRegistrationOpen({ open: true })
    expect((await caller(db).c.auth.registrationOpen()).allowOpenRegistration).toBe(true)
  })

  it('a self-registered owner cannot flip the instance-wide toggle', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getUserByUsername(db, 'owner')
    await caller(db, { userId: owner!.id }).c.auth.setRegistrationOpen({ open: true })

    // Register Nadia — she becomes owner of her OWN household…
    await caller(db).c.auth.register(REG)
    const nadia = await getUserByUsername(db, 'nadia')
    // …which must NOT let her control instance-wide registration.
    await expect(caller(db, { userId: nadia!.id }).c.auth.setRegistrationOpen({ open: false })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect((await caller(db).c.auth.registrationOpen()).allowOpenRegistration).toBe(true)
  })

  it('creates a new owner + their own household, and logs them in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const primaryOwner = await getUserByUsername(db, 'owner')
    await caller(db, { userId: primaryOwner!.id }).c.auth.setRegistrationOpen({ open: true })

    const reg = caller(db)
    expect(await reg.c.auth.register(REG)).toEqual({ ok: true })
    expect(reg.cookies.at(-1)).toBeTruthy() // a session was issued

    const nadia = await getUserByUsername(db, 'nadia')
    const grants = await db.select().from(membership).where(eq(membership.userId, nadia!.id))
    expect(grants).toHaveLength(1)
    expect(grants[0]?.role).toBe('owner')

    // A brand-new household, not the singleton, with its own joint member.
    const hhId = grants[0]!.householdId
    expect(hhId).not.toBe('household')
    const members = await db.select().from(member).where(eq(member.householdId, hhId))
    expect(members.some((m) => m.kind === 'joint')).toBe(true)

    // Usernames are unique across the instance.
    await expect(reg.c.auth.register(REG)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('concurrent sign-ups for the same username create exactly one account (#26)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const primaryOwner = await getUserByUsername(db, 'owner')
    await caller(db, { userId: primaryOwner!.id }).c.auth.setRegistrationOpen({ open: true })

    // Both requests pass the "is it taken?" check before either writes; the unique
    // index on user.username makes only one insert win, and the whole provision +
    // create runs in a transaction so the loser leaves no orphaned household.
    const results = await Promise.allSettled([
      caller(db).c.auth.register(REG),
      caller(db).c.auth.register(REG),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    // One 'nadia', and one new household beyond the singleton — no orphan.
    const grants = await db.select().from(membership).where(eq(membership.userId, (await getUserByUsername(db, 'nadia'))!.id))
    expect(grants).toHaveLength(1)
    expect(await db.select().from(household)).toHaveLength(2) // singleton + Nadia's
  })

  it('treats usernames case-insensitively (#14)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const primaryOwner = await getUserByUsername(db, 'owner')
    await caller(db, { userId: primaryOwner!.id }).c.auth.setRegistrationOpen({ open: true })

    // Register with mixed case; stored lower-cased and found by any casing.
    await caller(db).c.auth.register({ ...REG, username: 'Nadia' })
    expect((await getUserByUsername(db, 'nadia'))?.username).toBe('nadia')
    expect(await getUserByUsername(db, 'NADIA')).not.toBeNull()

    // A different-case duplicate is rejected, not silently accepted.
    await expect(caller(db).c.auth.register({ ...REG, username: 'NADIA' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
