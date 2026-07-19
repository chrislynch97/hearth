import { and, count, eq, gte, lt } from 'drizzle-orm'
import type { DB } from '../db/client'
import { auditLog } from '../db/schema'
import { sendAlert } from './alerts'

/**
 * Failed-login threshold alerting (issue #57).
 *
 * The audit trail already records every failed sign-in and lockout (#49), but
 * nobody reads a table on an unattended box. This sweeps the last window and
 * raises one alert when failures cross a threshold — enough to notice a
 * credential-stuffing run against a public instance, and deliberately far short
 * of a SIEM.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_THRESHOLD = 10

/** Failed logins in an hour that trigger an alert, from
 *  `HEARTH_AUTH_ALERT_THRESHOLD` (default 10). 0 disables the check; anything
 *  that isn't a non-negative integer falls back to the default. */
export function authAlertThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.HEARTH_AUTH_ALERT_THRESHOLD ?? '').trim()
  if (!/^\d+$/.test(raw)) return DEFAULT_THRESHOLD
  return Number(raw)
}

/** Failed sign-ins recorded in `[since, until)`, across every household — an
 *  attacker isn't scoped to one, and this runs as the instance operator. */
export async function countLoginFailures(db: DB, since: Date, until: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'auth'),
        eq(auditLog.action, 'login_failed'),
        gte(auditLog.createdAt, since),
        lt(auditLog.createdAt, until),
      ),
    )
  return row?.n ?? 0
}

/** Check one window and alert if it crossed the threshold. Exported for tests;
 *  the scheduler below is the only production caller. */
export async function checkAuthAnomalies(
  db: DB,
  since: Date,
  until: Date,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const threshold = authAlertThreshold(env)
  if (threshold === 0) return 0
  const failures = await countLoginFailures(db, since, until)
  if (failures < threshold) return failures
  await sendAlert(
    {
      event: 'auth_failures',
      message: `${failures} failed sign-in attempts in the last hour (threshold ${threshold})`,
      detail: { failures, threshold, since: since.toISOString(), until: until.toISOString() },
    },
    env,
  )
  return failures
}

/** Start the hourly failed-login sweep. Each tick scans the window since the
 *  previous tick, so a window is never scanned twice (which would re-alert on
 *  the same burst) and never skipped if a tick runs late. */
export function startAuthAlertScheduler(db: DB): void {
  let since = new Date()
  const tick = async () => {
    const until = new Date()
    try {
      await checkAuthAnomalies(db, since, until)
      since = until
    } catch (err) {
      // Leave `since` where it is so the unscanned window is picked up next tick.
      console.error('[hearth] auth anomaly check failed:', err)
    }
  }
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for the sweep
}
