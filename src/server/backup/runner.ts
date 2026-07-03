import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { household } from '../db/schema'
import { buildSnapshot } from '../db/snapshot'
import { shouldBackup, type BackupFrequency } from './schedule'

const HOUSEHOLD_ID = 'household'
const KEEP_BACKUPS = 14
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check hourly; frequency gates the actual write
const PREFIX = 'hearth-backup-'

/** `./data/backups` alongside the SQLite file. */
function backupDir(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/app.db'
  const base = url.startsWith('file:') ? dirname(url.slice('file:'.length)) : './data'
  return join(base, 'backups')
}

/** Write a JSON snapshot to disk, prune old ones, and stamp the household. */
export async function runBackup(db: DB): Promise<{ file: string; at: number }> {
  const snapshot = await buildSnapshot(db)
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${PREFIX}${stamp}.json`)
  writeFileSync(file, JSON.stringify(snapshot))

  const existing = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.json'))
    .sort()
  for (const old of existing.slice(0, Math.max(0, existing.length - KEEP_BACKUPS))) {
    rmSync(join(dir, old), { force: true })
  }

  const at = Date.now()
  await db.update(household).set({ backupLastAt: at, updatedAt: at }).where(eq(household.id, HOUSEHOLD_ID))
  return { file, at }
}

/** Start the periodic auto-backup check. A no-op frequency of 'off' means nothing
 *  is written; the check is cheap so it just runs hourly. */
export function startBackupScheduler(db: DB): void {
  const tick = async () => {
    try {
      const [hh] = await db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
      if (hh && shouldBackup(hh.backupFrequency as BackupFrequency, hh.backupLastAt, Date.now())) {
        await runBackup(db)
      }
    } catch (err) {
      console.error('Automatic backup failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for backups
}
