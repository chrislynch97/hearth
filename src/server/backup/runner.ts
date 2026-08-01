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
import { SchedulerLock, withLeaderLock } from '../db/leader'
import { household } from '../db/schema'
import * as schema from '../db/schema'
import { ALL_TABLES } from '../db/tables'
import { applySnapshot, buildSnapshot, type Snapshot } from '../db/snapshot'
import { shouldBackup, type BackupFrequency } from './schedule'
import { isReadable, resolveOffsiteConfig, uploadOffsite, type OffsiteConfig } from './offsite'
import { encryptSnapshot, decryptSnapshot } from './encrypt'
import { pingHeartbeat, sendAlert } from '../ops/alerts'
import type { PgTable } from 'drizzle-orm/pg-core'

const DEFAULT_KEEP_BACKUPS = 14
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check hourly; frequency gates the actual write
const PREFIX = 'hearth-backup-'
// In `offsite` primary mode the local file is a staging/verification artefact on
// a disk we assume is about to disappear, so only the newest is worth keeping.
const LOCAL_CACHE_KEEP = 1

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

/** Which copy *is* the backup (#114).
 *
 *  `local` (the default, and the whole self-hosted story): the file under
 *  `<data>/backups` is authoritative and the off-site copy is a bonus — a failed
 *  upload is logged and alerted but never fails the backup.
 *
 *  `offsite`: the remote copy is authoritative, for a hosted container whose disk
 *  doesn't survive a deploy. A failed upload fails the whole backup, so the
 *  household stays due and retries, the heartbeat fails, and the local file is
 *  kept only as a short-lived staging copy. Off-site must be configured — see
 *  `assertBackupConfig`, which refuses to boot otherwise. */
export type BackupPrimary = 'local' | 'offsite'

export function backupPrimary(env: NodeJS.ProcessEnv = process.env): BackupPrimary {
  const raw = (env.HEARTH_BACKUP_PRIMARY ?? '').trim().toLowerCase()
  if (raw === '' || raw === 'local') return 'local'
  if (raw === 'offsite') return 'offsite'
  throw new Error(`unknown HEARTH_BACKUP_PRIMARY "${raw}" (expected local or offsite)`)
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
 *  so a bad backup can't evict good older ones and the household stays "due".
 *  The off-site push sits inside that same guard (#114) — build, write, verify,
 *  upload, prune, stamp — so under `HEARTH_BACKUP_PRIMARY=offsite` a backup only
 *  counts once the durable copy has actually landed. */
export async function runBackup(db: DB, stampHouseholdIds: string[]): Promise<BackupResult> {
  const primary = backupPrimary()
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

  // Ship the verified snapshot off-site (opt-in, #39) BEFORE pruning or stamping.
  // In `offsite` mode this throws on failure, and the ordering is the point: the
  // household stays due for a retry and the older copies — which may be the only
  // surviving ones — are still there.
  const offsite = await pushOffsite(`${PREFIX}${stamp}.json.enc`, json, primary)

  pruneLocal(dir, primary === 'offsite' ? LOCAL_CACHE_KEEP : keepBackups())
  await pruneOffsite()

  const at = Date.now()
  if (stampHouseholdIds.length > 0) {
    const atDate = new Date(at)
    await db
      .update(household)
      .set({ backupLastAt: atDate, updatedAt: atDate })
      .where(inArray(household.id, stampHouseholdIds))
  }

  return { file, at, offsite }
}

/** Keep the newest `keep` local snapshots and delete the rest. Filenames carry an
 *  ISO stamp, so a lexical sort is a chronological one. */
function pruneLocal(dir: string, keep: number): void {
  const existing = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && (f.endsWith('.json') || f.endsWith('.json.enc')))
    .sort()
  for (const old of existing.slice(0, Math.max(0, existing.length - keep))) {
    rmSync(join(dir, old), { force: true })
  }
}

/** Apply the same retention off-site, for targets that can be enumerated and
 *  deleted from (#114). Without this the remote store grows forever — which is
 *  the store you're paying for, and the one that matters when it's primary.
 *
 *  Never throws: the backup itself has already succeeded by this point, and a
 *  target that can list but not delete (a read-only key) shouldn't turn a good
 *  backup into a failed one. A write-only `webhook` target has no retention here
 *  at all; that stays the receiving service's job. */
async function pruneOffsite(): Promise<void> {
  try {
    const config = resolveOffsiteConfig()
    if (!config || !isReadable(config.target)) return
    const keep = keepBackups()
    const names = (await config.target.list()).map((e) => e.name).sort()
    for (const old of names.slice(0, Math.max(0, names.length - keep))) {
      await config.target.remove(old)
    }
  } catch (err) {
    console.error('Off-site backup pruning failed (the backup itself succeeded):', err)
  }
}

/** Encrypt and push the snapshot to the configured off-site target.
 *
 *  In `local` primary mode this never throws: the local backup is already written
 *  and verified, so a misconfigured or flaky off-site target is logged and
 *  returned as `{ ok: false }` rather than failing a backup that would otherwise
 *  re-run and re-write every hour. In `offsite` mode the upload *is* the backup,
 *  so every one of those cases throws instead. */
async function pushOffsite(name: string, json: string, primary: BackupPrimary): Promise<OffsiteOutcome | undefined> {
  const strict = primary === 'offsite'
  let config: OffsiteConfig | null
  try {
    config = resolveOffsiteConfig()
  } catch (err) {
    if (strict) throw err
    console.error('Off-site backup is misconfigured (local backup is unaffected):', err)
    return { kind: 'unknown', ok: false, error: errorText(err) }
  }
  if (!config) {
    if (strict) {
      throw new Error(
        'HEARTH_BACKUP_PRIMARY=offsite, but off-site backups are switched off — set HEARTH_BACKUP_OFFSITE.',
      )
    }
    return undefined
  }
  try {
    await uploadOffsite(config, name, json)
    return { kind: config.target.kind, ok: true }
  } catch (err) {
    if (strict) {
      throw new Error(`off-site backup upload failed (${config.target.kind}): ${errorText(err)}`, { cause: err })
    }
    console.error('Off-site backup upload failed (local backup is unaffected):', err)
    return { kind: config.target.kind, ok: false, error: errorText(err) }
  }
}

/** Fail fast at boot when `HEARTH_BACKUP_PRIMARY=offsite` can't actually work.
 *  A hosted instance that quietly falls back to writing backups onto a disk it's
 *  about to lose looks healthy right up until the deploy that needs them, so a
 *  bad config is fatal at startup rather than an hourly log line. Returns a line
 *  describing what it found, for the caller to log. */
export function assertBackupConfig(env: NodeJS.ProcessEnv = process.env): string {
  const primary = backupPrimary(env)
  const config = resolveOffsiteConfig(env)
  if (primary === 'local') {
    const offsite = config ? `, off-site copies to ${config.target.kind}` : ''
    return `backups: local ${backupDir(env)} (primary)${offsite}`
  }
  if (!config) {
    throw new Error(
      'HEARTH_BACKUP_PRIMARY=offsite, but HEARTH_BACKUP_OFFSITE is off — there would be nowhere ' +
        'durable to put the backups. Configure an off-site target, or unset HEARTH_BACKUP_PRIMARY.',
    )
  }
  const restorable = isReadable(config.target)
    ? ''
    : ` (write-only — no in-app restore or remote retention from a ${config.target.kind} target)`
  return `backups: ${config.target.kind} off-site (primary)${restorable}, local ${backupDir(env)} as staging`
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Start the periodic auto-backup check. Every household sets its own
 *  `backupFrequency`; the tick backs up (one whole-db snapshot) whenever any
 *  household is due and stamps each due household. 'off' means never.
 *  Leader-guarded (#113): only one replica backs up a given due window. */
export function startBackupScheduler(db: DB): void {
  const tick = async () => {
    try {
      await withLeaderLock(db, SchedulerLock.backup, async () => {
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
          // Inside the leader guard for the same reason: a replica that skipped the
          // tick must not report a backup it didn't take.
          await pingHeartbeat('success', `backup written to ${result.file}`)
          if (result.offsite && !result.offsite.ok) {
            await sendAlert({
              event: 'offsite_backup_failed',
              message: 'Off-site backup upload failed (the local backup succeeded)',
              detail: { target: result.offsite.kind, error: result.offsite.error },
            })
          }
        }
      })
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
