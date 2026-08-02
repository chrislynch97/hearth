import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { endAllSessionsFromConsole } from './end-all-sessions'
import { createSession, createUserWithMembership, getOwnerUser, getValidSession } from './session'
import { auditLog, session } from '../db/schema'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import type { DB } from '../db/client'

// Break-glass containment from the console (#248). `scripts/end-all-sessions.ts`
// is a confirmation prompt around this; the guarantee it has to make — every
// session on the instance gone, and a record of it — is all here.

/** An extra accepted member of the default household; returns its user id. */
async function addUser(db: DB, username: string): Promise<string> {
  return createUserWithMembership(db, {
    username,
    displayName: username,
    email: null,
    passwordHash: 'x',
    householdId: DEFAULT_HOUSEHOLD_ID,
    role: 'member',
  })
}

describe('endAllSessionsFromConsole', () => {
  it('ends every session, whoever it belongs to', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    const ben = await addUser(db, 'ben')
    const ownerToken = await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)
    const benToken = await createSession(db, ben, DEFAULT_HOUSEHOLD_ID)

    expect(await endAllSessionsFromConsole(db)).toBe(2)
    expect(await getValidSession(db, ownerToken)).toBeNull()
    expect(await getValidSession(db, benToken)).toBeNull()
    expect(await db.select().from(session)).toHaveLength(0)
  })

  it('records the revocation with no actor — the console operator has no identity', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = (await getOwnerUser(db))!
    await createSession(db, owner.id, DEFAULT_HOUSEHOLD_ID)

    await endAllSessionsFromConsole(db)

    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'sessions_revoked'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actorUserId).toBeNull()
    expect(rows[0]!.householdId).toBe(DEFAULT_HOUSEHOLD_ID)
    expect(JSON.parse(rows[0]!.changes ?? '{}')).toEqual({
      kind: 'event',
      details: { count: 1, scope: 'instance', via: 'console' },
    })
  })

  it('is a no-op that still records when nobody is signed in', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    expect(await endAllSessionsFromConsole(db)).toBe(0)
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'sessions_revoked'))
    expect(rows).toHaveLength(1)
  })
})
