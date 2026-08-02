import { describe, it, expect } from 'vitest'
import {
  SUBSCRIPTION_STATUSES,
  isEntitled,
  mapProviderStatus,
  type BillingProvider,
  type SubscriptionStatus,
} from './status'

/** Every status each provider can send us, with the state it means here. A
 *  provider status missing from this table is one the webhook throws on, which
 *  is deliberate — see mapProviderStatus. */
const CASES: Array<[BillingProvider, string, SubscriptionStatus]> = [
  ['paddle', 'active', 'active'],
  ['paddle', 'trialing', 'active'],
  ['paddle', 'past_due', 'past_due'],
  ['paddle', 'paused', 'past_due'],
  ['paddle', 'canceled', 'cancelled'],
  ['lemonsqueezy', 'active', 'active'],
  ['lemonsqueezy', 'on_trial', 'active'],
  ['lemonsqueezy', 'past_due', 'past_due'],
  ['lemonsqueezy', 'paused', 'past_due'],
  ['lemonsqueezy', 'unpaid', 'past_due'],
  ['lemonsqueezy', 'cancelled', 'cancelled'],
  ['lemonsqueezy', 'expired', 'cancelled'],
]

describe('mapProviderStatus', () => {
  it.each(CASES)('%s %s → %s', (provider, raw, expected) => {
    expect(mapProviderStatus(provider, raw)).toBe(expected)
  })

  it('only ever produces a storable status', () => {
    // `grace` and `none` are derived, never written — a mapping that produced
    // one would put a state in the column that can silently go stale.
    for (const [provider, raw] of CASES) {
      expect(SUBSCRIPTION_STATUSES).toContain(mapProviderStatus(provider, raw))
    }
  })

  it('tolerates casing and surrounding whitespace', () => {
    expect(mapProviderStatus('paddle', ' Past_Due ')).toBe('past_due')
  })

  it('throws on a status it has never seen, rather than guessing', () => {
    // Guessing is wrong either way: one guess bills a lapsed household, the
    // other locks a paying one out. The webhook must fail loudly instead.
    expect(() => mapProviderStatus('paddle', 'chargeback')).toThrow(/unknown paddle subscription status/)
    expect(() => mapProviderStatus('lemonsqueezy', 'trialing')).toThrow() // Paddle's word, not theirs
  })
})

describe('isEntitled', () => {
  it('grants access while active or in grace', () => {
    expect(isEntitled('active')).toBe(true)
    expect(isEntitled('grace')).toBe(true)
  })

  it('withholds it once past due, cancelled, or absent', () => {
    expect(isEntitled('past_due')).toBe(false)
    expect(isEntitled('cancelled')).toBe(false)
    expect(isEntitled('none')).toBe(false)
  })
})
