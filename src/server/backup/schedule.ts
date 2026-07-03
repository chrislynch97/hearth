export type BackupFrequency = 'off' | 'daily' | 'weekly'

const DAY_MS = 86_400_000

/** Whether an automatic backup is due, given the configured frequency and the
 *  last backup time (null = never). */
export function shouldBackup(frequency: BackupFrequency, lastAt: number | null, now: number): boolean {
  if (frequency === 'off') return false
  if (lastAt === null) return true
  const interval = frequency === 'weekly' ? 7 * DAY_MS : DAY_MS
  return now - lastAt >= interval
}
