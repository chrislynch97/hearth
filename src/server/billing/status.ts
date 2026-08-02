/** Hearth's subscription vocabulary, and the one place a payment provider's
 *  vocabulary is translated into it (#232).
 *
 *  Provider status strings differ between Paddle and Lemon Squeezy and change
 *  when a provider feels like it. Normalising at the webhook boundary keeps them
 *  out of the gating middleware, the lapse logic and the UI, so swapping merchant
 *  of record is a change to this file rather than a rewrite.
 */

export const BILLING_PROVIDERS = ['paddle', 'lemonsqueezy'] as const

export type BillingProvider = (typeof BILLING_PROVIDERS)[number]

/** What can be stored in `subscription.status`. `grace` and `none` are NOT here:
 *  grace is derived from `past_due` plus a future `graceUntil`, and `none` means
 *  there is no row at all. Storing a derived state would let it go stale. */
export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'cancelled'] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/** What a consumer sees, once the row (or its absence) has been interpreted. */
export const ENTITLEMENT_STATUSES = ['active', 'grace', 'past_due', 'cancelled', 'none'] as const

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number]

/** Whether this state grants full access. Grace counts: a failed payment inside
 *  the window is fully functional (#235), which is the whole point of it. */
export function isEntitled(status: EntitlementStatus): boolean {
  return status === 'active' || status === 'grace'
}

// A trial is entitled — someone mid-trial has full access — so both providers'
// trial states map to `active`. `paused` maps to `past_due` rather than
// `cancelled`: cancelled carries "paid through the period end", which a paused
// subscription hasn't, so treating it as cancelled would hand out access nobody
// paid for.
const PADDLE: Readonly<Record<string, SubscriptionStatus>> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  paused: 'past_due',
  canceled: 'cancelled', // Paddle spells it with one l
}

const LEMONSQUEEZY: Readonly<Record<string, SubscriptionStatus>> = {
  active: 'active',
  on_trial: 'active',
  past_due: 'past_due',
  paused: 'past_due',
  unpaid: 'past_due', // dunning exhausted; grace and the lapse rules take it from here
  cancelled: 'cancelled',
  expired: 'cancelled',
}

const PROVIDER_STATUSES: Readonly<Record<BillingProvider, Readonly<Record<string, SubscriptionStatus>>>> = {
  paddle: PADDLE,
  lemonsqueezy: LEMONSQUEEZY,
}

/** Translate a provider's status string into ours. Throws on anything unmapped:
 *  a status we don't recognise must stop the webhook loudly rather than be
 *  guessed at, since either guess is wrong — one bills a lapsed household, the
 *  other locks a paying one out. */
export function mapProviderStatus(provider: BillingProvider, raw: string): SubscriptionStatus {
  const mapped = PROVIDER_STATUSES[provider][raw.trim().toLowerCase()]
  if (!mapped) {
    throw new Error(`unknown ${provider} subscription status "${raw}" — it needs mapping in billing/status.ts`)
  }
  return mapped
}
