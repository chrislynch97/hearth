import type { DB } from './db/client'
import { getInstanceSettings } from './db/instanceSettings'
import { checkForUpdates, type UpdateStatus } from './updates'

// Background update polling (issue #81). Mirrors the backup/audit-prune/session
// schedulers: an hourly self-unref'ing interval with a leading tick, best-effort.
// When auto-poll (or auto-update) is on, it refreshes the GitHub release check and
// caches it so the client can read "update available" cheaply, without every
// client hitting GitHub. The scheduled auto-apply branch is added in Phase 2b.

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

/** Start the periodic update-check poller. No-op work when auto-poll and
 *  auto-update are both off — nothing phones home unless the owner opted in. */
export function startUpdateScheduler(db: DB): void {
  const tick = async () => {
    try {
      const settings = await getInstanceSettings(db)
      if (!settings.autoPoll && !settings.autoUpdate) return
      cached = { status: await checkForUpdates(), polledAt: Date.now() }
    } catch (err) {
      console.error('Update check failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for update polling
}
