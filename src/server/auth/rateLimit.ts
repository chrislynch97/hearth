/** Sliding-window rate limiter, keyed by (e.g.) client IP. Used to throttle
 *  password attempts on the login gate. State lives in the database, not process
 *  memory, so it survives a restart and is shared by every replica running
 *  against the same database (issue #112) — N instances grant one attempt budget
 *  between them, not N budgets. */

import { and, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { rateLimit } from '../db/schema'
import type { DBOrTx } from '../db/client'

export interface RateLimitConfig {
  windowMs: number
  maxAttempts: number
  blockMs: number
}

export class RateLimiter {
  // Process-local: only throttles how often *this* instance bothers sweeping.
  // Replicas sweep independently; the delete is idempotent either way.
  private lastSweep = 0

  /** `name` namespaces this limiter's rows — two limiters keyed on the same IP
   *  (login and register, say) must not share a counter. */
  constructor(
    private readonly name: string,
    private readonly cfg: RateLimitConfig,
  ) {}

  /** Whether a new attempt is currently allowed for `key`. */
  async check(db: DBOrTx, key: string, now: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const [row] = await db
      .select({ blockedUntil: rateLimit.blockedUntil })
      .from(rateLimit)
      .where(and(eq(rateLimit.limiter, this.name), eq(rateLimit.key, key)))
      .limit(1)
    const blockedUntil = row?.blockedUntil?.getTime() ?? 0
    if (blockedUntil > now) return { allowed: false, retryAfterMs: blockedUntil - now }
    return { allowed: true, retryAfterMs: 0 }
  }

  /** Record a failed attempt; blocks the key once attempts exceed the max in the
   *  window. One upsert, so concurrent attempts across replicas can't interleave
   *  a read-then-write and each grant themselves a fresh count. */
  async fail(db: DBOrTx, key: string, now: number): Promise<void> {
    await this.sweep(db, now)
    const at = new Date(now)
    // Rows whose window opened before this are stale: the attempt starts a new window.
    const windowFloor = new Date(now - this.cfg.windowMs)
    const blockUntil = new Date(now + this.cfg.blockMs)
    const rolled = sql`${rateLimit.windowStart} < ${windowFloor}::timestamptz`

    await db
      .insert(rateLimit)
      .values({ limiter: this.name, key, count: 1, windowStart: at, blockedUntil: null })
      .onConflictDoUpdate({
        target: [rateLimit.limiter, rateLimit.key],
        set: {
          count: sql`case when ${rolled} then 1 else ${rateLimit.count} + 1 end`,
          windowStart: sql`case when ${rolled} then ${at}::timestamptz else ${rateLimit.windowStart} end`,
          blockedUntil: sql`case
            when ${rolled} then null
            when ${rateLimit.count} + 1 >= ${this.cfg.maxAttempts} then ${blockUntil}::timestamptz
            else ${rateLimit.blockedUntil} end`,
        },
      })
  }

  /** Drop this limiter's rows that are past their window and no longer blocked,
   *  so the table can't grow without bound from one-off keys (e.g. a stream of
   *  distinct spoofed or rotating IPs). Cheap and amortised: at most once per
   *  window per instance. Scoped to `name` — another limiter's rows live under a
   *  different window length and are not ours to expire. */
  private async sweep(db: DBOrTx, now: number): Promise<void> {
    if (now - this.lastSweep < this.cfg.windowMs) return
    this.lastSweep = now
    await db
      .delete(rateLimit)
      .where(
        and(
          eq(rateLimit.limiter, this.name),
          lt(rateLimit.windowStart, new Date(now - this.cfg.windowMs)),
          or(isNull(rateLimit.blockedUntil), lte(rateLimit.blockedUntil, new Date(now))),
        ),
      )
  }

  /** Number of tracked keys — for tests/observability. */
  async size(db: DBOrTx): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rateLimit)
      .where(eq(rateLimit.limiter, this.name))
    return row?.n ?? 0
  }

  /** Clear a key's history (call on a successful login). */
  async reset(db: DBOrTx, key: string): Promise<void> {
    await db.delete(rateLimit).where(and(eq(rateLimit.limiter, this.name), eq(rateLimit.key, key)))
  }
}
