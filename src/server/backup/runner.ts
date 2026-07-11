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
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { DB } from '../db/client'
import { household } from '../db/schema'
import * as schema from '../db/schema'
import { ALL_TABLES } from '../db/tables'
import { applySnapshot, buildSnapshot, type Snapshot } from '../db/snapshot'
import { shouldBackup, type BackupFrequency } from './schedule'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

const KEEP_BACKUPS = 14
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check hourly; frequency gates the actual write
const PREFIX = 'hearth-backup-'
// Owner-only: the snapshot holds password hashes and MFA secrets, so it must not
// be world-readable on a host-mounted volume. (No-op on Windows, harmless there.)
const BACKUP_MODE = 0o600

/** `./data/backups` alongside the SQLite file. */
function backupDir(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/app.db'
  const base = url.startsWith('file:') ? dirname(url.slice('file:'.length)) : './data'
  return join(base, 'backups')
}

/** Serialize `data` to `file` durably and atomically: write a sibling temp file,
 *  fsync it, then `rename` into place. A crash mid-write leaves the `.tmp` — never
 *  a truncated `.json` that would sort as "newest" and be picked for a restore. */
function writeFileAtomic(file: string, data: string): void {
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
 *  An in-memory database suffices: `applySnapshot` uses libsql's `batch` (not an
 *  interactive transaction), which works on `:memory:`, and there's no temp file
 *  to leak or fail to unlink on Windows. */
async function verifyRestores(snapshot: Snapshot): Promise<void> {
  const client = createClient({ url: ':memory:' })
  try {
    const probe = drizzle(client, { schema })
    await migrate(probe, { migrationsFolder: './drizzle' })
    await applySnapshot(probe as unknown as DB, snapshot.tables)
    // Re-read each table and confirm the restored count matches the snapshot, so
    // we're checking rows actually persisted (not just that the batch didn't throw).
    for (const [name, table] of ALL_TABLES) {
      const restored = (await probe.select().from(table as SQLiteTable)).length
      const expected = (snapshot.tables[name] ?? []).length
      if (restored !== expected) {
        throw new Error(`restore verification failed for "${name}": expected ${expected} rows, got ${restored}`)
      }
    }
  } finally {
    client.close()
  }
}

/** Write a JSON snapshot to disk, prune old ones, and stamp `backupLastAt` on the
 *  given households. The snapshot is whole-database, so a single file backs up
 *  every household; `stampHouseholdIds` records the backup against each household
 *  it was run for (e.g. the caller's, or every household that was due).
 *
 *  The snapshot is written atomically and then verified by restoring it into a
 *  throwaway database; if verification fails we throw before pruning or stamping,
 *  so a bad backup can't evict good older ones and the household stays "due". */
export async function runBackup(db: DB, stampHouseholdIds: string[]): Promise<{ file: string; at: number }> {
  const snapshot = await buildSnapshot(db)
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${PREFIX}${stamp}.json`)
  writeFileAtomic(file, JSON.stringify(snapshot))

  // Verify the bytes we just wrote actually restore — read the file back (not the
  // in-memory object) so we also exercise the on-disk write and JSON round-trip.
  await verifyRestores(JSON.parse(readFileSync(file, 'utf8')) as Snapshot)

  const existing = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.json'))
    .sort()
  for (const old of existing.slice(0, Math.max(0, existing.length - KEEP_BACKUPS))) {
    rmSync(join(dir, old), { force: true })
  }

  const at = Date.now()
  if (stampHouseholdIds.length > 0) {
    await db.update(household).set({ backupLastAt: at, updatedAt: at }).where(inArray(household.id, stampHouseholdIds))
  }
  return { file, at }
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
        .filter((hh) => shouldBackup(hh.backupFrequency as BackupFrequency, hh.backupLastAt, now))
        .map((hh) => hh.id)
      if (dueIds.length > 0) {
        await runBackup(db, dueIds)
      }
    } catch (err) {
      console.error('Automatic backup failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for backups
}
