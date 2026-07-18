import { eq } from 'drizzle-orm'
import type { DBOrTx } from './client'
import { instanceSettings } from './schema'

// Single-row table; this is its fixed primary key.
const INSTANCE_ID = 'instance'

export interface InstanceSettingsView {
  allowOpenRegistration: boolean
  /** The instance operator's user id, or null before it's been backfilled. */
  ownerUserId: string | null
  /** Whether login is required (the instance is "locked"). */
  authRequired: boolean
  /** Poll GitHub for new releases in the background (issue #81). */
  autoPoll: boolean
  /** Run a backup before applying an update. */
  preUpdateBackup: boolean
  /** Apply updates automatically (managed image deploy only). */
  autoUpdate: boolean
  /** Local "HH:MM" daily auto-update window; null ⇒ apply as soon as detected. */
  autoUpdateTime: string | null
  /** Local "YYYY-MM-DD" of the last auto-applied update (once-per-day guard). */
  updateLastAppliedDate: string | null
}

/** Instance-wide settings, with safe defaults when the row hasn't been written. */
export async function getInstanceSettings(db: DBOrTx): Promise<InstanceSettingsView> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  return {
    allowOpenRegistration: (row?.allowOpenRegistration ?? 0) === 1,
    ownerUserId: row?.ownerUserId ?? null,
    authRequired: (row?.authRequired ?? 0) === 1,
    autoPoll: (row?.autoPoll ?? 1) === 1,
    preUpdateBackup: (row?.preUpdateBackup ?? 1) === 1,
    autoUpdate: (row?.autoUpdate ?? 0) === 1,
    autoUpdateTime: row?.autoUpdateTime ?? null,
    updateLastAppliedDate: row?.updateLastAppliedDate ?? null,
  }
}

interface InstanceSettingsPatch {
  allowOpenRegistration?: boolean
  ownerUserId?: string | null
  authRequired?: boolean
  autoPoll?: boolean
  preUpdateBackup?: boolean
  autoUpdate?: boolean
  autoUpdateTime?: string | null
  updateLastAppliedDate?: string | null
}

/** Upsert one or more fields on the singleton settings row. */
async function patchInstanceSettings(db: DBOrTx, patch: InstanceSettingsPatch): Promise<void> {
  const now = new Date()
  const set: Record<string, unknown> = { updatedAt: now }
  if (patch.allowOpenRegistration !== undefined) set.allowOpenRegistration = patch.allowOpenRegistration ? 1 : 0
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId
  if (patch.authRequired !== undefined) set.authRequired = patch.authRequired ? 1 : 0
  if (patch.autoPoll !== undefined) set.autoPoll = patch.autoPoll ? 1 : 0
  if (patch.preUpdateBackup !== undefined) set.preUpdateBackup = patch.preUpdateBackup ? 1 : 0
  if (patch.autoUpdate !== undefined) set.autoUpdate = patch.autoUpdate ? 1 : 0
  if (patch.autoUpdateTime !== undefined) set.autoUpdateTime = patch.autoUpdateTime
  if (patch.updateLastAppliedDate !== undefined) set.updateLastAppliedDate = patch.updateLastAppliedDate

  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  if (row) {
    await db.update(instanceSettings).set(set).where(eq(instanceSettings.id, INSTANCE_ID))
  } else {
    // Omitted columns fall back to their schema defaults (autoPoll/preUpdateBackup
    // on, autoUpdate off) — only carry through what the patch explicitly set.
    await db.insert(instanceSettings).values({
      id: INSTANCE_ID,
      allowOpenRegistration: patch.allowOpenRegistration ? 1 : 0,
      ownerUserId: patch.ownerUserId ?? null,
      authRequired: patch.authRequired ? 1 : 0,
      ...(patch.autoPoll !== undefined ? { autoPoll: patch.autoPoll ? 1 : 0 } : {}),
      ...(patch.preUpdateBackup !== undefined ? { preUpdateBackup: patch.preUpdateBackup ? 1 : 0 } : {}),
      ...(patch.autoUpdate !== undefined ? { autoUpdate: patch.autoUpdate ? 1 : 0 } : {}),
      ...(patch.autoUpdateTime !== undefined ? { autoUpdateTime: patch.autoUpdateTime } : {}),
      ...(patch.updateLastAppliedDate !== undefined ? { updateLastAppliedDate: patch.updateLastAppliedDate } : {}),
      createdAt: now,
      updatedAt: now,
    })
  }
}

/** Turn open registration on or off, upserting the singleton settings row. */
export async function setAllowOpenRegistration(db: DBOrTx, open: boolean): Promise<void> {
  await patchInstanceSettings(db, { allowOpenRegistration: open })
}

/** Record the instance operator user id. */
export async function setInstanceOwnerId(db: DBOrTx, userId: string | null): Promise<void> {
  await patchInstanceSettings(db, { ownerUserId: userId })
}

/** Record whether login is required (the instance is locked). */
export async function setAuthRequired(db: DBOrTx, required: boolean): Promise<void> {
  await patchInstanceSettings(db, { authRequired: required })
}

/** The owner-editable update preferences (issue #81), saved as a group. */
export type UpdateSettingsPatch = Pick<
  InstanceSettingsPatch,
  'autoPoll' | 'preUpdateBackup' | 'autoUpdate' | 'autoUpdateTime'
>

/** Persist the update preferences. */
export async function setUpdateSettings(db: DBOrTx, patch: UpdateSettingsPatch): Promise<void> {
  await patchInstanceSettings(db, patch)
}

/** Stamp the local date of the last auto-applied update (once-per-day guard). */
export async function setUpdateLastAppliedDate(db: DBOrTx, date: string): Promise<void> {
  await patchInstanceSettings(db, { updateLastAppliedDate: date })
}
