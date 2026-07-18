import type { DB } from './db/client'
import { household } from './db/schema'
import { getInstanceSettings, setUpdateLastAppliedDate } from './db/instanceSettings'
import { checkForUpdates, type UpdateStatus } from './updates'
import { isUpdaterOnline, requestUpdate } from './updater'
import { runBackup } from './backup/runner'
import { writeSecurityEvent } from './trpc/audit'

// Background update polling + scheduled auto-apply (issue #81). Mirrors the
// backup/audit-prune/session schedulers: an hourly self-unref'ing interval with a
// leading tick, best-effort. When auto-poll (or auto-update) is on it refreshes
// the GitHub release check and caches it so clients read "update available"
// cheaply. When auto-update is on and the host updater is online, it applies at
// most once per calendar day, within the configured hour.

const POLL_INTERVAL_MS = 60 * 60 * 1000 // hourly

interface CachedStatus {
  status: UpdateStatus
  polledAt: number
}

let cached: CachedStatus | null = null

/** The last cached background poll result, or null if nothing has been polled
 *  yet (auto-poll off, or before the first tick). */
export function getCachedUpdateStatus(): CachedStatus | null {
  return cached
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local calendar date "YYYY-MM-DD" — the once-per-day auto-apply guard. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Is `now` inside the configured daily auto-update window? A null time means
 *  "apply as soon as an update is detected"; otherwise the tick that shares the
 *  target hour is the window (the scheduler runs hourly). */
export function isScheduledNow(time: string | null, now: Date): boolean {
  if (!time) return true
  const hour = Number(time.slice(0, 2))
  return Number.isFinite(hour) && now.getHours() === hour
}

/** Start the periodic update-check poller + scheduled auto-apply. No work when
 *  auto-poll and auto-update are both off — nothing phones home unless opted in. */
export function startUpdateScheduler(db: DB): void {
  const tick = async () => {
    try {
      const settings = await getInstanceSettings(db)
      if (!settings.autoPoll && !settings.autoUpdate) return

      const status = await checkForUpdates()
      cached = { status, polledAt: Date.now() }

      if (!settings.autoUpdate || !status.updateAvailable) return
      if (!isUpdaterOnline()) return

      const now = new Date()
      const today = localDate(now)
      // Once per calendar day, only within the configured hour.
      if (settings.updateLastAppliedDate === today) return
      if (!isScheduledNow(settings.autoUpdateTime, now)) return

      await applyScheduledUpdate(db, settings.preUpdateBackup, status.latest, today)
    } catch (err) {
      console.error('Update check failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for update polling
}

/** Apply a scheduled update: optional backup first, stamp the once-per-day guard
 *  (before signalling — the container is about to be recreated), audit it, then
 *  ask the host updater to pull + recreate. */
async function applyScheduledUpdate(
  db: DB,
  backupFirst: boolean,
  toVersion: string | null,
  today: string,
): Promise<void> {
  const households = await db.select({ id: household.id }).from(household)
  const ids = households.map((h) => h.id)
  if (backupFirst && ids.length > 0) {
    await runBackup(db, ids)
  }
  await setUpdateLastAppliedDate(db, today)
  if (ids[0]) {
    await writeSecurityEvent(db, {
      householdId: ids[0],
      actorUserId: null,
      entityType: 'instance',
      entityId: 'updates',
      action: 'update_applied',
      details: { toVersion, via: 'scheduled', backupFirst },
    })
  }
  requestUpdate(toVersion)
}
