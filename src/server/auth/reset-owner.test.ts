import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { resetOwnerCredentials } from './reset-owner'
import { getOwnerUser } from './session'
import { auditLog, session, user } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

// The break-glass owner reset (issue #51). The CLI wrapper is a prompt around
// this; the recovery guarantee it has to make — new password works, MFA gone,
// sessions dead — is all here.

/** The owner, locked out the realistic way: MFA on, phone lost, sessions live. */
async function lockedOutOwner(db: DB): Promise<string> {
  const owner = (await getOwnerUser(db))!
  await appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner.id }).auth.setPassword({
    newPassword: 'the-forgotten-password',
  })
  await db
    .update(user)
    .set({ mfaSecret: 'LOSTPHONESECRET', mfaEnabledAt: new Date(), mfaRecoveryCodes: '["spent"]', mfaLastStep: 42 })
    .where(eq(user.id, owner.id))
  await db.insert(session).values({
    id: newId(),
    userId: owner.id,
    activeHouseholdId: 'household',
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000_000),
    absoluteExpiresAt: new Date(Date.now() + 1_000_000),
  })
  return owner.id
}

describe('resetOwnerCredentials', () => {
  it('gets a locked-out owner back in: new password works, MFA cleared, sessions gone', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerUserId = await lockedOutOwner(db)

    const result = await resetOwnerCredentials(db, 'a-brand-new-strong-pw')
    expect(result).toMatchObject({ username: 'owner', mfaCleared: true })

    const [after] = await db.select().from(user).where(eq(user.id, ownerUserId))
    expect(after!.mfaEnabledAt).toBeNull()
    expect(after!.mfaSecret).toBeNull()
    expect(after!.mfaRecoveryCodes).toBeNull()
    expect(after!.mfaLastStep).toBeNull()
    // Whoever locked them out doesn't keep the session they were holding.
    expect(await db.select().from(session).where(eq(session.userId, ownerUserId))).toHaveLength(0)

    // The point of the whole exercise: the owner can sign in again, with no code.
    const login = await appRouter
      .createCaller({ db, householdId: 'household', setSessionCookie: () => {} })
      .auth.login({ username: 'owner', password: 'a-brand-new-strong-pw' })
    expect(login).toEqual({ ok: true })
  })

  it('leaves the instance locked — recovery is not a way to open it up', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await lockedOutOwner(db)

    await resetOwnerCredentials(db, 'a-brand-new-strong-pw')

    const status = await appRouter.createCaller({ db, householdId: 'household' }).auth.status()
    expect(status.passwordSet).toBe(true)
  })

  it('refuses a password the policy would reject, leaving the account untouched', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerUserId = await lockedOutOwner(db)
    const [before] = await db.select().from(user).where(eq(user.id, ownerUserId))

    await expect(resetOwnerCredentials(db, 'short')).rejects.toThrow()

    const [after] = await db.select().from(user).where(eq(user.id, ownerUserId))
    expect(after!.passwordHash).toBe(before!.passwordHash)
    expect(after!.mfaSecret).toBe('LOSTPHONESECRET')
  })

  it('records the reset as a console event with no actor, and never the password', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const ownerUserId = await lockedOutOwner(db)

    const secret = 'a-brand-new-strong-pw'
    await resetOwnerCredentials(db, secret)

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, ownerUserId))
    const actions = rows.map((r) => r.action)
    expect(actions).toContain('password_reset')
    expect(actions).toContain('mfa_disabled')
    const reset = rows.find((r) => r.action === 'password_reset')!
    // Nobody signed in did this — attributing it to the owner would misreport it.
    expect(reset.actorUserId).toBeNull()
    expect(JSON.parse(reset.changes!).details).toEqual({ via: 'console', mfaCleared: true })
    expect(JSON.stringify(rows)).not.toContain(secret)
  })

  it('reports a database with no owner rather than resetting something arbitrary', async () => {
    const db = await makeTestDb() // migrated, but never seeded — no owner exists
    await expect(resetOwnerCredentials(db, 'a-brand-new-strong-pw')).rejects.toThrow(/no owner account/i)
  })
})
