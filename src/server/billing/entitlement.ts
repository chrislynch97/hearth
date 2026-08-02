import { eq } from 'drizzle-orm'
import type { DBOrTx } from '../db/client'
import { subscription } from '../db/schema'
import type { EntitlementStatus } from './status'

/** What a household is entitled to right now. The single answer every consumer
 *  reads — the gating middleware, the lapse banner, the billing screen — so that
 *  "is this household paid up" is decided in one place rather than re-derived
 *  from raw columns at each call site. */
export interface Entitlement {
  status: EntitlementStatus
  /** The plan they're on, or null when there's no subscription. */
  plan: string | null
  /** When the current access runs out: the paid-through date while active, the
   *  end of the grace window while in grace, null once neither applies. */
  activeUntil: Date | null
}

/** No subscription row: a self-host, or a household that never subscribed. */
const NONE: Entitlement = { status: 'none', plan: null, activeUntil: null }

/** A household's entitlement, derived from its subscription row. "No row" means
 *  `none` — never an error, since that's the normal state of every self-host.
 *
 *  Two derivations happen here rather than in the stored status, so neither can
 *  go stale between webhooks: a `past_due` household inside its grace window is
 *  `grace`, and a `cancelled` one is still `active` until the period it paid for
 *  actually ends (cancelling mid-period must not revoke access — #235). The
 *  pending end date is `activeUntil` in both cases. */
export async function getEntitlement(
  db: DBOrTx,
  householdId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const [row] = await db.select().from(subscription).where(eq(subscription.householdId, householdId))
  if (!row) return NONE

  const inFuture = (at: Date | null): boolean => at !== null && at.getTime() > now.getTime()

  switch (row.status) {
    case 'active':
      return { status: 'active', plan: row.plan, activeUntil: row.currentPeriodEnd }
    case 'past_due':
      return inFuture(row.graceUntil)
        ? { status: 'grace', plan: row.plan, activeUntil: row.graceUntil }
        : { status: 'past_due', plan: row.plan, activeUntil: null }
    case 'cancelled':
      return inFuture(row.currentPeriodEnd)
        ? { status: 'active', plan: row.plan, activeUntil: row.currentPeriodEnd }
        : { status: 'cancelled', plan: row.plan, activeUntil: null }
    default:
      // Only the webhook writes this column, and only through mapProviderStatus.
      // A value it can't produce means the row was tampered with or hand-edited;
      // fail closed rather than grant access on an unknown state.
      return { status: 'none', plan: row.plan, activeUntil: null }
  }
}
