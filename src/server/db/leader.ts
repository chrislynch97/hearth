import { sql } from 'drizzle-orm'
import { PGlite } from '@electric-sql/pglite'
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
 * Embedded PGlite is exempt entirely (issue #149). It has a single connection,
 * so an open transaction blocks every other query on the instance — including
 * `work`'s, which is waiting on the very transaction that's waiting for it, a
 * permanent deadlock that wedged the database at boot. Election is meaningless
 * there anyway: PGlite runs in-process and locks its data directory, so the
 * sole replica is always the leader.
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

/** True when `db` is embedded PGlite, which serves every query from one
 *  connection — so nothing may run against `db` while a transaction is open on
 *  it. Read off the driver handle rather than `DATABASE_URL` so tests and the
 *  demo take the same branch production does for the engine they're on. */
function isSingleConnection(db: DB): boolean {
  return (db as unknown as { $client?: unknown }).$client instanceof PGlite
}

/** Run `work` only if this instance wins `lock` for the duration, returning
 *  whether it did. A `false` return means another replica is running that
 *  scheduler right now and this tick was skipped — the normal, uninteresting
 *  outcome on every non-leader. Errors from `work` propagate to the caller
 *  (each scheduler already logs and swallows its own). */
export async function withLeaderLock(db: DB, lock: SchedulerLock, work: () => Promise<void>): Promise<boolean> {
  if (isSingleConnection(db)) {
    await work()
    return true
  }

  return db.transaction(async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, ${lock}) as locked`,
    )
    if (!result.rows[0]?.locked) return false
    await work()
    return true
  })
}
