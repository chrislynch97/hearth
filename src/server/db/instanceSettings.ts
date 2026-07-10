import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { instanceSettings } from './schema'

// Single-row table; this is its fixed primary key.
const INSTANCE_ID = 'instance'

export interface InstanceSettingsView {
  allowOpenRegistration: boolean
  /** The instance operator's user id, or null before it's been backfilled. */
  ownerUserId: string | null
  /** Whether login is required (the instance is "locked"). */
  authRequired: boolean
}

/** Instance-wide settings, with safe defaults when the row hasn't been written. */
export async function getInstanceSettings(db: DB): Promise<InstanceSettingsView> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  return {
    allowOpenRegistration: (row?.allowOpenRegistration ?? 0) === 1,
    ownerUserId: row?.ownerUserId ?? null,
    authRequired: (row?.authRequired ?? 0) === 1,
  }
}

/** Upsert one or more fields on the singleton settings row. */
async function patchInstanceSettings(
  db: DB,
  patch: { allowOpenRegistration?: boolean; ownerUserId?: string | null; authRequired?: boolean },
): Promise<void> {
  const now = Date.now()
  const set: Record<string, unknown> = { updatedAt: now }
  if (patch.allowOpenRegistration !== undefined) set.allowOpenRegistration = patch.allowOpenRegistration ? 1 : 0
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId
  if (patch.authRequired !== undefined) set.authRequired = patch.authRequired ? 1 : 0

  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  if (row) {
    await db.update(instanceSettings).set(set).where(eq(instanceSettings.id, INSTANCE_ID))
  } else {
    await db.insert(instanceSettings).values({
      id: INSTANCE_ID,
      allowOpenRegistration: patch.allowOpenRegistration ? 1 : 0,
      ownerUserId: patch.ownerUserId ?? null,
      authRequired: patch.authRequired ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
  }
}

/** Turn open registration on or off, upserting the singleton settings row. */
export async function setAllowOpenRegistration(db: DB, open: boolean): Promise<void> {
  await patchInstanceSettings(db, { allowOpenRegistration: open })
}

/** Record the instance operator user id. */
export async function setInstanceOwnerId(db: DB, userId: string | null): Promise<void> {
  await patchInstanceSettings(db, { ownerUserId: userId })
}

/** Record whether login is required (the instance is locked). */
export async function setAuthRequired(db: DB, required: boolean): Promise<void> {
  await patchInstanceSettings(db, { authRequired: required })
}
