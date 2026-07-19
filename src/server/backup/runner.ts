import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { DB } from '../db/client'
import { household } from '../db/schema'
import * as schema from '../db/schema'
import { ALL_TABLES } from '../db/tables'
import { applySnapshot, buildSnapshot, type Snapshot } from '../db/snapshot'
import { shouldBackup, type BackupFrequency } from './schedule'
import { resolveOffsiteConfig, uploadOffsite } from './offsite'
import { encryptSnapshot, decryptSnapshot } from './encrypt'
import { pingHeartbeat, sendAlert } from '../ops/alerts'
import type { PgTable } from 'drizzle-orm/pg-core'

const DEFAULT_KEEP_BACKUPS = 14
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check hourly; frequency gates the actual write
const PREFIX = 'hearth-backup-'

/** How many local snapshots to keep, from `HEARTH_BACKUP_KEEP` (default 14).
 *  Clamped to at least 1: a retention of 0 would prune the backup we just wrote,
 *  so a typo'd or empty value must never be read as "keep nothing". Anything that
 *  isn't a positive integer falls back to the default rather than failing the
 *  backup — losing backups is the worse outcome. */
export function keepBackups(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.HEARTH_BACKUP_KEEP ?? '').trim()
  if (raw === '') return DEFAULT_KEEP_BACKUPS
  if (!/^\d+$/.test(raw)) {
    console.error(
      `Ignoring invalid HEARTH_BACKUP_KEEP="${raw}" (want a positive integer); keeping ${DEFAULT_KEEP_BACKUPS}.`,
    )
    return DEFAULT_KEEP_BACKUPS
  }
  return Math.max(1, Number(raw))
}

/** Outcome of the optional off-site copy, surfaced on the backup result so the
 *  manual "Back up now" UI can tell the operator whether it landed. Absent when
 *  off-site backups are disabled (the default). */
export interface OffsiteOutcome {
  kind: string
  ok: boolean
  error?: string
}

export interface BackupResult {
  file: string
  at: number
  offsite?: OffsiteOutcome
}
// Owner-only: the snapshot holds password hashes and MFA secrets, so it must not
// be world-readable on a host-mounted volume. (No-op on Windows, harmless there.)
const BACKUP_MODE = 0o600

/** Where local snapshots are written.
 *
 *  `HEARTH_BACKUP_LOCAL_DIR` overrides everything below, so backups can land on a
 *  different volume from the database without involving the off-site machinery
 *  (#53). Don't confuse it with `HEARTH_BACKUP_DIR`, which is the *off-site*
 *  `directory` target — this one is the primary local copy.
 *
 *  Otherwise: `./data/backups`, alongside the local data directory. For an
 *  embedded PGlite target the backups sit next to its data dir; for a real
 *  Postgres server (or when DATABASE_URL is unset) they fall back to
 *  `./data/backups`.
 *
 *  Note (see #40): there is deliberately no per-driver branch here. The snapshot
 *  is a *logical* backup taken through drizzle (`buildSnapshot` → `db.select()`),
 *  so it is engine-agnostic — the same JSON snapshot/restore path runs against
 *  both PGlite and a real `postgres://` server, and `verifyRestores` proves each
 *  one by restoring into an in-memory PGlite. Operators running a real Postgres
 *  server should additionally rely on physical backups at the infra level
 *  (`pg_dump` / PITR / a managed snapshot); the app-level snapshot is the portable
 *  logical copy, not a replacement for those. */
export function backupDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.HEARTH_BACKUP_LOCAL_DIR ?? '').trim()
  if (override !== '') return override
  const url = env.DATABASE_URL
  let base = './data'
  if (url && /^pglite:(\/\/)?/.test(url)) {
    const dir = url.replace(/^pglite:(\/\/)?/, '')
    base = dir.length > 0 ? dirname(dir) : './data'
  }
  return join(base, 'backups')
}

/** The passphrase used to encrypt backups at rest, or `null` for plaintext. A
 *  snapshot holds password hashes and MFA/TOTP secrets, so when a passphrase is
 *  configured we encrypt the *local* copy too (not just the off-site one, #46) —
 *  the local files live on a host-mounted volume that host-level tooling can copy.
 *  Plaintext stays the default only when no passphrase is set (issue #46). This is
 *  the same `HEARTH_BACKUP_PASSPHRASE` that gates off-site encryption, so one
 *  passphrase protects both copies. */
function localPassphrase(env: NodeJS.ProcessEnv = process.env): string | null {
  const passphrase = env.HEARTH_BACKUP_PASSPHRASE ?? ''
  return passphrase.length > 0 ? passphrase : null
}

/** Serialize `data` to `file` durably and atomically: write a sibling temp file,
 *  fsync it, then `rename` into place. A crash mid-write leaves the `.tmp` — never
 *  a truncated backup that would sort as "newest" and be picked for a restore. */
function writeFileAtomic(file: string, data: Uint8Array): void {
  const tmp = `${file}.tmp`
  const fd = openSync(tmp, 'w', BACKUP_MODE)
  try {
    writeSync(fd, data)
    fsyncSync(fd) // flush to disk before the rename, so the bytes survive a crash
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file) // atomic on the same filesystem
}

/** Restore `snapshot` into a throwaway, freshly-migrated database and confirm
 *  every row lands. A backup that has never been restored isn't a backup; this
 *  runs the real import path (`applySnapshot`) against the snapshot on every
 *  backup, so a schema/data mismatch surfaces as a failed backup rather than as a
 *  surprise on the day you actually need to restore. Throws if it doesn't verify.
 *
 *  An in-memory PGlite database suffices — real Postgres semantics (the same
 *  engine production uses), no temp file to leak or fail to unlink on Windows. */
async function verifyRestores(snapshot: Snapshot): Promise<void> {
  const pglite = new PGlite() // in-memory, isolated
  try {
    const probe = drizzle(pglite, { schema })
    await migrate(probe, { migrationsFolder: './drizzle' })
    await applySnapshot(probe as unknown as DB, snapshot.tables)
    // Re-read each table and confirm the restored count matches the snapshot, so
    // we're checking rows actually persisted (not just that the insert didn't throw).
    for (const [name, table] of ALL_TABLES) {
      const restored = (await probe.select().from(table as PgTable)).length
      const expected = (snapshot.tables[name] ?? []).length
      if (restored !== expected) {
        throw new Error(`restore verification failed for "${name}": expected ${expected} rows, got ${restored}`)
      }
    }
  } finally {
    await pglite.close()
  }
}

/** Write a snapshot to disk, prune old ones, and stamp `backupLastAt` on the
 *  given households. The snapshot is whole-database, so a single file backs up
 *  every household; `stampHouseholdIds` records the backup against each household
 *  it was run for (e.g. the caller's, or every household that was due). The local
 *  file is plaintext JSON by default, or an encrypted `.json.enc` envelope when
 *  `HEARTH_BACKUP_PASSPHRASE` is set (#46).
 *
 *  The snapshot is written atomically and then verified by restoring it into a
 *  throwaway database; if verification fails we throw before pruning or stamping,
 *  so a bad backup can't evict good older ones and the household stays "due". */
export async function runBackup(db: DB, stampHouseholdIds: string[]): Promise<BackupResult> {
  const snapshot = await buildSnapshot(db)
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })

  // When a passphrase is set, the local snapshot is encrypted at rest (`.json.enc`);
  // otherwise it stays plaintext JSON (issue #46). The off-site copy below is always
  // encrypted regardless — this only decides the local file's format.
  const passphrase = localPassphrase()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const json = JSON.stringify(snapshot)
  const file = join(dir, `${PREFIX}${stamp}${passphrase ? '.json.enc' : '.json'}`)
  writeFileAtomic(file, passphrase ? encryptSnapshot(json, passphrase) : Buffer.from(json, 'utf8'))

  // Verify the bytes we just wrote actually restore — read the file back (not the
  // in-memory object) so we also exercise the on-disk write and (de)serialization
  // round-trip, decrypting first when the local copy is encrypted.
  const written = readFileSync(file)
  const restoredJson = passphrase ? decryptSnapshot(written, passphrase) : written.toString('utf8')
  await verifyRestores(JSON.parse(restoredJson) as Snapshot)

  const keep = keepBackups()
  const existing = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && (f.endsWith('.json') || f.endsWith('.json.enc')))
    .sort()
  for (const old of existing.slice(0, Math.max(0, existing.length - keep))) {
    rmSync(join(dir, old), { force: true })
  }

  const at = Date.now()
  if (stampHouseholdIds.length > 0) {
    const atDate = new Date(at)
    await db
      .update(household)
      .set({ backupLastAt: atDate, updatedAt: atDate })
      .where(inArray(household.id, stampHouseholdIds))
  }

  // Ship a verified snapshot off-site (opt-in, #39). Best-effort: the local backup
  // above is already written, verified and stamped, so a misconfigured or flaky
  // off-site target is logged and reported but never fails the local backup (which
  // would otherwise re-run and re-write every hour) or evicts a good local copy.
  const offsite = await pushOffsite(`${PREFIX}${stamp}.json.enc`, json)
  return { file, at, offsite }
}

/** Encrypt and push the snapshot to the configured off-site target. Returns
 *  `undefined` when off-site backups are disabled, and never throws — any
 *  misconfiguration or upload failure is logged and returned as `{ ok: false }`. */
async function pushOffsite(name: string, json: string): Promise<OffsiteOutcome | undefined> {
  let config
  try {
    config = resolveOffsiteConfig()
  } catch (err) {
    console.error('Off-site backup is misconfigured (local backup is unaffected):', err)
    return { kind: 'unknown', ok: false, error: errorText(err) }
  }
  if (!config) return undefined
  try {
    await uploadOffsite(config, name, json)
    return { kind: config.target.kind, ok: true }
  } catch (err) {
    console.error('Off-site backup upload failed (local backup is unaffected):', err)
    return { kind: config.target.kind, ok: false, error: errorText(err) }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Start the periodic auto-backup check. Every household sets its own
 *  `backupFrequency`; the tick backs up (one whole-db snapshot) whenever any
 *  household is due and stamps each due household. 'off' means never. */
export function startBackupScheduler(db: DB): void {
  const tick = async () => {
    try {
      const now = Date.now()
      const households = await db.select().from(household)
      const dueIds = households
        .filter((hh) =>
          shouldBackup(hh.backupFrequency as BackupFrequency, hh.backupLastAt?.getTime() ?? null, now),
        )
        .map((hh) => hh.id)
      if (dueIds.length > 0) {
        const result = await runBackup(db, dueIds)
        // Ping only when a backup actually ran, so the heartbeat's expected period
        // matches the household's backup frequency rather than this hourly tick.
        await pingHeartbeat('success', `backup written to ${result.file}`)
        if (result.offsite && !result.offsite.ok) {
          await sendAlert({
            event: 'offsite_backup_failed',
            message: 'Off-site backup upload failed (the local backup succeeded)',
            detail: { target: result.offsite.kind, error: result.offsite.error },
          })
        }
      }
    } catch (err) {
      console.error('Automatic backup failed:', err)
      // A log line is not enough on an unattended box (#57): fail the heartbeat so
      // the dead-man's switch fires now instead of after the grace period, and
      // raise the alert for a human.
      await pingHeartbeat('fail', errorText(err))
      await sendAlert({
        event: 'backup_failed',
        message: 'Automatic backup failed',
        detail: { error: errorText(err) },
      })
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for backups
}
