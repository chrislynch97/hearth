// Break-glass containment from the console (#248).
//
// `sessions.revokeAll` is the same action with a running app behind it. This is
// the half that survives one that won't start — and the only route at all on the
// embedded PGlite database, which is in-process, so there is no socket and no
// `psql` to reach it with. Driven by `scripts/end-all-sessions.ts`.
import type { DB } from '../db/client'
import { deleteAllSessions, defaultHouseholdFor, getOwnerUser } from './session'
import { writeSecurityEvent } from '../trpc/audit'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'

/** End every session on the instance and record it. Returns how many went. */
export async function endAllSessionsFromConsole(db: DB): Promise<number> {
  const count = await deleteAllSessions(db)
  await recordRevocation(db, count)
  return count
}

/** Record the revocation in the audit trail. The actor is deliberately `null`:
 *  the console operator is nobody the app can name, and attributing it to the
 *  owner would misreport a break-glass entry as something the owner did.
 *
 *  Scoped to the owner's household so it lands where they'll actually read it.
 *  Best-effort: the sessions are already gone, and an unwritable trail must not
 *  make a successful containment look like it failed. */
async function recordRevocation(db: DB, count: number): Promise<void> {
  try {
    const owner = await getOwnerUser(db)
    const householdId = owner ? await defaultHouseholdFor(db, owner.id) : DEFAULT_HOUSEHOLD_ID
    await writeSecurityEvent(db, {
      householdId,
      actorUserId: null,
      entityType: 'instance',
      entityId: 'sessions',
      action: 'sessions_revoked',
      details: { count, scope: 'instance', via: 'console' },
    })
  } catch (err) {
    console.warn('[end-all-sessions] sessions were ended but the audit entry could not be written:', err)
  }
}
