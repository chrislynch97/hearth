import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { newId } from '../../../shared/ids'
import type { AuditLog } from '../../db/schema'

/**
 * Archive-before-prune for the audit trail (issue #43).
 *
 * Pruning (#41) is a hard delete, and the `audit_log` table is excluded from the
 * backup snapshot (#39/#40) — so once a range is pruned it is gone with no copy
 * anywhere. When a household opts in (`auditPruneArchive`), the pruner writes the
 * to-be-deleted rows to a JSON file here *before* deleting them, so the trail is
 * archived rather than silently dropped.
 *
 * The archive inherits the audit log's sensitivity (it records who-changed-what
 * across the household), so it is written the same owner-only, durable, atomic
 * way the backups are (backup/runner.ts): temp file + fsync + rename, mode 0600.
 * It stays off the append-only write path — only the sanctioned prune touches it.
 */

// Owner-only: the archive holds the same who-changed-what detail as the live
// trail, so it must not be world-readable on a host-mounted volume. (No-op on
// Windows, harmless there — mirrors backup/runner.ts.)
const ARCHIVE_MODE = 0o600
const PREFIX = 'hearth-audit-'

/** `./data/audit-archive`, alongside the local data/backups dirs. Mirrors
 *  backup/runner.ts `backupDir()`: for an embedded PGlite target the archive
 *  sits next to its data dir; for a real Postgres server (or when DATABASE_URL is
 *  unset) it falls back to `./data/audit-archive`. */
export function auditArchiveDir(): string {
  const url = process.env.DATABASE_URL
  let base = './data'
  if (url && /^pglite:(\/\/)?/.test(url)) {
    const dir = url.replace(/^pglite:(\/\/)?/, '')
    base = dir.length > 0 ? dirname(dir) : './data'
  }
  return join(base, 'audit-archive')
}

/** The archived range as stored on disk: the whole pruned rows plus the metadata
 *  needed to make sense of the file in isolation (which household, what window,
 *  when it was pruned). `createdAt` serialises to an ISO string via `toJSON`. */
interface AuditArchive {
  householdId: string
  cutoff: string
  prunedAt: string
  count: number
  entries: AuditLog[]
}

/** Serialize `data` to `file` durably and atomically: temp file, fsync, rename —
 *  so a crash mid-write leaves a `.tmp`, never a truncated archive that looks
 *  complete. Matches backup/runner.ts `writeFileAtomic`. */
function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`
  const fd = openSync(tmp, 'w', ARCHIVE_MODE)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
}

/** Write the pruned `rows` for one household to an owner-only JSON archive under
 *  `dir`, returning the file path. Called by the pruner before it deletes the
 *  range. The filename carries the prune instant and a uuid so concurrent prunes
 *  (e.g. several households in one scheduler tick) never collide. */
export function writeAuditArchive(dir: string, householdId: string, cutoff: Date, rows: AuditLog[]): string {
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${PREFIX}${stamp}-${newId()}.json`)
  const archive: AuditArchive = {
    householdId,
    cutoff: cutoff.toISOString(),
    prunedAt: new Date().toISOString(),
    count: rows.length,
    entries: rows,
  }
  writeFileAtomic(file, JSON.stringify(archive))
  return file
}
