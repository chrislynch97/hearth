import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The app side of the managed-update apply seam (issue #81, Phase 2b). The app
// has ZERO Docker/host privilege: to apply an update it only writes a request
// file to the shared data volume. A host-side updater (systemd timer / cron —
// see scripts/hearth-updater.sh) watches for it, performs `docker compose pull`
// + `up -d`, writes a result file, and touches a heartbeat so the app can tell
// whether managed updates are active. No socket, no network, no listening port.

const HEARTBEAT_FILE = '.updater-heartbeat'
const REQUEST_FILE = 'update-request.json'
const RESULT_FILE = 'update-result.json'

// The updater touches its heartbeat every run (~30s); treat it as online only if
// seen recently, so a stopped updater stops offering the one-click button.
const HEARTBEAT_MAX_AGE_MS = 3 * 60 * 1000

export interface UpdateResult {
  ok: boolean
  version: string | null
  at: number
  error?: string
}

/** The shared directory the app and host updater exchange control files in.
 *  `HEARTH_UPDATE_DIR` overrides; otherwise it sits next to the data dir. */
export function updateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.HEARTH_UPDATE_DIR ?? '').trim()
  if (override !== '') return override
  const url = env.DATABASE_URL
  let base = './data'
  if (url && /^pglite:(\/\/)?/.test(url)) {
    const dir = url.replace(/^pglite:(\/\/)?/, '')
    base = dir.length > 0 ? dirname(dir) : './data'
  }
  return join(base, 'updates')
}

/** Whether a host updater is present and running (fresh heartbeat). Gates the
 *  one-click "Update now" button and the scheduled auto-apply. */
export function isUpdaterOnline(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const stat = statSync(join(updateDir(env), HEARTBEAT_FILE))
    return Date.now() - stat.mtimeMs < HEARTBEAT_MAX_AGE_MS
  } catch {
    return false
  }
}

/** Ask the host updater to apply an update, by atomically writing the request
 *  file. Best-effort signalling — the updater picks it up on its next tick. */
export function requestUpdate(toVersion: string | null, env: NodeJS.ProcessEnv = process.env): void {
  const dir = updateDir(env)
  mkdirSync(dir, { recursive: true })
  const body = JSON.stringify({ requestedAt: Date.now(), toVersion }, null, 2) + '\n'
  const file = join(dir, REQUEST_FILE)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, body, { mode: 0o644 })
  renameSync(tmp, file) // atomic: the updater never sees a half-written request
}

/** The outcome the host updater reported for the last apply, if any. */
export function readUpdateResult(env: NodeJS.ProcessEnv = process.env): UpdateResult | null {
  try {
    const parsed = JSON.parse(readFileSync(join(updateDir(env), RESULT_FILE), 'utf8')) as UpdateResult
    return typeof parsed.ok === 'boolean' ? parsed : null
  } catch {
    return null
  }
}

/** Whether an apply request is still pending (the updater hasn't cleared it). */
export function isUpdatePending(env: NodeJS.ProcessEnv = process.env): boolean {
  return existsSync(join(updateDir(env), REQUEST_FILE))
}
