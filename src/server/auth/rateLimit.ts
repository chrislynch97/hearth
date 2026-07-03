/** In-memory sliding-window rate limiter, keyed by (e.g.) client IP. Used to
 *  throttle password attempts on the login gate. Process-local — fine for a
 *  single self-hosted instance; a reverse proxy can add more if needed. */

export interface RateLimitConfig {
  windowMs: number
  maxAttempts: number
  blockMs: number
}

interface Entry {
  count: number
  windowStart: number
  blockedUntil: number
}

export class RateLimiter {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly cfg: RateLimitConfig) {}

  /** Whether a new attempt is currently allowed for `key`. */
  check(key: string, now: number): { allowed: boolean; retryAfterMs: number } {
    const entry = this.entries.get(key)
    if (entry && entry.blockedUntil > now) {
      return { allowed: false, retryAfterMs: entry.blockedUntil - now }
    }
    return { allowed: true, retryAfterMs: 0 }
  }

  /** Record a failed attempt; blocks the key once attempts exceed the max in the window. */
  fail(key: string, now: number): void {
    const entry = this.entries.get(key)
    if (!entry || now - entry.windowStart > this.cfg.windowMs) {
      this.entries.set(key, { count: 1, windowStart: now, blockedUntil: 0 })
      return
    }
    entry.count += 1
    if (entry.count >= this.cfg.maxAttempts) {
      entry.blockedUntil = now + this.cfg.blockMs
    }
  }

  /** Clear a key's history (call on a successful login). */
  reset(key: string): void {
    this.entries.delete(key)
  }
}
