// Break-glass recovery for the instance owner (#51).
//
// `access.resetPassword` deliberately can't rescue the owner: it needs a signed-in
// admin, and the owner is the one account no one outranks. So a sole owner who
// loses their password — or their authenticator, with the recovery codes gone —
// has no way back in short of hand-editing the database.
//
// This is the escape hatch, driven from the console by whoever has the box. That
// grants nothing an attacker with the same access couldn't already take (they own
// the database file either way); what it changes is that legitimate recovery no
// longer needs a SQL prompt and a correct guess at how we hash passwords.
//
// It resets credentials wholesale — password, MFA, and every live session — because
// the caller can't know which of them is the reason they're locked out.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { user } from '../db/schema'
import { hashPassword } from './password'
import { defaultHouseholdFor, deleteUserSessions, getOwnerUser, syncAuthRequired } from './session'
import { writeSecurityEvent } from '../trpc/audit'
import { validatePassword } from '../../shared/password-policy'

/** What the reset did, for the operator's confirmation message. */
export interface OwnerResetResult {
  username: string
  displayName: string
  /** Whether MFA was actually on and has now been cleared. */
  mfaCleared: boolean
}

/**
 * Give the instance owner a new password, clear their MFA enrolment, and end
 * their sessions. Throws (leaving the account untouched) if there's no owner to
 * reset or the new password fails the shared policy.
 */
export async function resetOwnerCredentials(db: DB, newPassword: string): Promise<OwnerResetResult> {
  const owner = await getOwnerUser(db)
  if (!owner) {
    throw new Error('This database has no owner account to reset — is DATABASE_URL pointing at your instance?')
  }

  const weak = validatePassword(newPassword)
  if (weak) throw new Error(weak)

  const mfaCleared = owner.mfaEnabledAt !== null
  await db
    .update(user)
    .set({
      passwordHash: await hashPassword(newPassword),
      // The lost authenticator is the likelier lockout, and the operator has no
      // way to prove otherwise from here, so clear the enrolment outright.
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaRecoveryCodes: null,
      mfaLastStep: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, owner.id))
  // Whoever locked the owner out may be holding a session; MFA only gates new
  // logins, so a reset that left sessions alone would leave them signed in (#50).
  await deleteUserSessions(db, owner.id)
  await syncAuthRequired(db) // the owner has a password → the instance stays locked

  await recordReset(db, owner.id, mfaCleared)
  return { username: owner.username, displayName: owner.displayName, mfaCleared }
}

/** Record the reset in the audit trail — the event, never the new password (#49).
 *  The actor is deliberately `null`: the console operator is nobody the app can
 *  name, and attributing it to the owner would misreport a break-glass entry as
 *  something the owner did. Best-effort: the reset has already committed, and an
 *  unwritable trail must not make a recovery look like it failed. */
async function recordReset(db: DB, ownerId: string, mfaCleared: boolean): Promise<void> {
  try {
    const householdId = await defaultHouseholdFor(db, ownerId)
    await writeSecurityEvent(db, {
      householdId,
      actorUserId: null,
      entityType: 'user',
      entityId: ownerId,
      action: 'password_reset',
      details: { via: 'console', mfaCleared },
    })
    if (mfaCleared) {
      await writeSecurityEvent(db, {
        householdId,
        actorUserId: null,
        entityType: 'user',
        entityId: ownerId,
        action: 'mfa_disabled',
        details: { via: 'console' },
      })
    }
  } catch (err) {
    console.warn('[reset-owner] the reset succeeded but could not be written to the audit log:', err)
  }
}
