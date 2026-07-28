import { writeSecurityEvent } from '../trpc/audit'
import type { User } from '../db/schema'
import type { DB } from '../db/client'
import { defaultHouseholdFor } from './session'

/** Record a failed sign-in (issue #49). A failure throws, so the staged-flush
 *  path never runs — write it directly, before the throw. Best-effort: an audit
 *  failure must never mask the auth error. Only attempts against a *real* account
 *  are recorded (they have a household to attribute the attempt to, and are the
 *  ones worth reviewing); attempts on an unknown username are rate-limited noise
 *  with no owning household, so they are deliberately not written. The actor is
 *  left null — a failed attempt does not prove the account holder made it. */
export async function recordLoginFailure(db: DB, u: User | null, username: string, reason: string): Promise<void> {
  if (!u) return
  try {
    await writeSecurityEvent(db, {
      householdId: await defaultHouseholdFor(db, u.id),
      actorUserId: null,
      entityType: 'auth',
      entityId: u.id,
      action: 'login_failed',
      details: { username, reason },
    })
  } catch (err) {
    console.error('[audit] failed to record login failure', err)
  }
}
