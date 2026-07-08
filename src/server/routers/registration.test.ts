import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getUserByUsername } from '../auth/session'
import { member, membership } from '../db/schema'
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
  it('is closed by default; only an owner can open it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    expect((await caller(db).c.auth.registrationOpen()).allowOpenRegistration).toBe(false)
    await expect(caller(db).c.auth.register(REG)).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await expect(caller(db, { role: 'member' }).c.auth.setRegistrationOpen({ open: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await caller(db, { role: 'owner' }).c.auth.setRegistrationOpen({ open: true })
    expect((await caller(db).c.auth.registrationOpen()).allowOpenRegistration).toBe(true)
  })

  it('creates a new owner + their own household, and logs them in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await caller(db, { role: 'owner' }).c.auth.setRegistrationOpen({ open: true })

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
})
