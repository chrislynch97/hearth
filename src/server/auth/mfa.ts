import { eq } from 'drizzle-orm'
import { user } from '../db/schema'
import type { User } from '../db/schema'
import type { DB } from '../db/client'
import { consumeRecoveryCode, matchTotpStep } from './totp'

/** Verify a login MFA code: first as a TOTP, then as a single-use recovery code
 *  (which is consumed on success). Returns whether it was accepted. A TOTP step
 *  is accepted only if it's newer than the last-used one, so a captured code
 *  can't be replayed inside its ±1-step validity window. */
export async function verifyMfaCode(db: DB, u: User, code: string): Promise<boolean> {
  if (u.mfaSecret) {
    const step = matchTotpStep(u.mfaSecret, code)
    if (step !== null) {
      if (u.mfaLastStep !== null && step <= u.mfaLastStep) return false // replayed code
      await db.update(user).set({ mfaLastStep: step, updatedAt: new Date() }).where(eq(user.id, u.id))
      return true
    }
  }
  if (!u.mfaRecoveryCodes) return false
  const hashes = JSON.parse(u.mfaRecoveryCodes) as string[]
  const remaining = await consumeRecoveryCode(code, hashes)
  if (remaining === null) return false
  await db
    .update(user)
    .set({ mfaRecoveryCodes: JSON.stringify(remaining), updatedAt: new Date() })
    .where(eq(user.id, u.id))
  return true
}
