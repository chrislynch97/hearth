import { statfsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { isServerPgUrl, pgliteDir } from '../db/target'

/**
 * Readiness check behind `/healthz` (issue #57).
 *
 * An unattended instance fails silently in two ways that a "is the port open?"
 * probe can't see: the database stops answering, and the disk fills up (the
 * embedded PGlite data dir and the local backups both grow on local disk, and a
 * small VPS runs out long before anything else breaks). Both are checked here so
 * an external uptime monitor pointed at `/healthz` catches them.
 */

const DEFAULT_MIN_FREE_MB = 512
const DB_TIMEOUT_MS = 5_000
const MB = 1024 * 1024

export interface HealthDetail {
  status: 'ok' | 'degraded'
  db: { ok: boolean; error?: string }
  disk: { ok: boolean; path: string; freeMb?: number; minFreeMb: number; error?: string }
}

/** The boolean-only body served to callers. `/healthz` is unauthenticated, so the
 *  response says *whether* we're healthy and nothing else — free-byte counts and
 *  error strings stay in the server log. */
export interface HealthBody {
  status: 'ok' | 'degraded'
  checks: { db: { ok: boolean }; disk: { ok: boolean } }
}

/** The local directory whose filesystem we watch. For the embedded engine that's
 *  the PGlite data dir; against a real Postgres server the database lives
 *  elsewhere, so we watch `./data`, which still holds the local backups. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL
  return isServerPgUrl(url) ? './data' : pgliteDir(url)
}

/** Free space below which the instance reports degraded, from
 *  `HEARTH_DISK_MIN_FREE_MB` (default 512). Anything that isn't a positive
 *  integer falls back to the default — a typo must not silently disable the
 *  check that exists to catch a full disk. */
export function minFreeMb(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.HEARTH_DISK_MIN_FREE_MB ?? '').trim()
  if (!/^\d+$/.test(raw)) return DEFAULT_MIN_FREE_MB
  return Math.max(1, Number(raw))
}

/** statfs needs a path that exists; the data dir may not have been created yet on
 *  a first boot. Walk up to the nearest existing ancestor — it's the same
 *  filesystem, so the free-space number is the one we want either way. */
function nearestExisting(path: string): string {
  let current = resolve(path)
  for (;;) {
    try {
      statfsSync(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current // reached the root; let the caller's statfs throw
      current = parent
    }
  }
}

/** Free megabytes on the filesystem holding `path`. */
export function freeMbOn(path: string): number {
  const stats = statfsSync(nearestExisting(path))
  return Math.floor((stats.bavail * stats.bsize) / MB)
}

/** `select 1`, bounded by a timeout — a wedged connection pool would otherwise
 *  hang the probe rather than reporting unhealthy, which reads to a monitor as a
 *  timeout with no explanation in the log. */
async function pingDb(db: DB): Promise<HealthDetail['db']> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`no response in ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS)
      }),
    ])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

function checkDisk(env: NodeJS.ProcessEnv = process.env): HealthDetail['disk'] {
  const path = dataDir(env)
  const min = minFreeMb(env)
  try {
    const free = freeMbOn(path)
    return { ok: free >= min, path, freeMb: free, minFreeMb: min }
  } catch (err) {
    // Can't read the filesystem at all — report it rather than assuming healthy.
    return { ok: false, path, minFreeMb: min, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Run every readiness check. Never throws: a check that blows up is reported as
 *  a failed check, because a 500 from the probe itself tells a monitor nothing. */
export async function checkHealth(db: DB, env: NodeJS.ProcessEnv = process.env): Promise<HealthDetail> {
  const [dbCheck, disk] = [await pingDb(db), checkDisk(env)]
  return { status: dbCheck.ok && disk.ok ? 'ok' : 'degraded', db: dbCheck, disk }
}

/** Strip a detailed report down to what's safe to serve unauthenticated. */
export function healthBody(detail: HealthDetail): HealthBody {
  return { status: detail.status, checks: { db: { ok: detail.db.ok }, disk: { ok: detail.disk.ok } } }
}
