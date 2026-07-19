import { sql } from 'drizzle-orm'
import type { DB } from './client'

/**
 * Leader election for the background schedulers (issue #113).
 *
 * Every replica runs the backup, audit-prune and session-purge timers, so N
 * replicas against one Postgres would do the same due work N times (N duplicate
 * backups per window, N concurrent prunes). A Postgres advisory lock is the
 * cheapest fix: whichever replica wins the lock for a tick is the leader for
 * that tick, and the others skip it entirely rather than queueing behind it.
 *
 * The lock is transaction-scoped (`pg_try_advisory_xact_lock`), so Postgres
 * releases it on commit — and, crucially, on a crashed or disconnected replica
 * too, which a session-scoped lock plus an explicit unlock would leak. The work
 * runs inside that transaction's lifetime but against the pooled `db`, since
 * this is mutual exclusion, not atomicity: a tick that fails part-way is still
 * safe (all three are idempotent and re-run next tick).
 *
 * Single-instance self-host is unaffected — the sole replica always wins, and
 * embedded PGlite supports advisory locks like any other Postgres.
 */

/** Namespace for every Hearth advisory lock, so a key can't collide with an
 *  unrelated lock taken elsewhere against the same database. */
const LOCK_NAMESPACE = 0x48544820 // "HTH "

/** The schedulers that elect a leader, and their per-scheduler lock key. Keys
 *  are fixed and must never be reused for a different scheduler. */
export const SchedulerLock = {
  backup: 1,
  auditPrune: 2,
  sessionPurge: 3,
} as const

export type SchedulerLock = (typeof SchedulerLock)[keyof typeof SchedulerLock]

/** Run `work` only if this instance wins `lock` for the duration, returning
 *  whether it did. A `false` return means another replica is running that
 *  scheduler right now and this tick was skipped — the normal, uninteresting
 *  outcome on every non-leader. Errors from `work` propagate to the caller
 *  (each scheduler already logs and swallows its own). */
export async function withLeaderLock(db: DB, lock: SchedulerLock, work: () => Promise<void>): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, ${lock}) as locked`,
    )
    if (!result.rows[0]?.locked) return false
    await work()
    return true
  })
}
