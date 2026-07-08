import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { instanceSettings } from './schema'

// Single-row table; this is its fixed primary key.
const INSTANCE_ID = 'instance'

/** Instance-wide settings, with safe defaults when the row hasn't been written. */
export async function getInstanceSettings(db: DB): Promise<{ allowOpenRegistration: boolean }> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  return { allowOpenRegistration: (row?.allowOpenRegistration ?? 0) === 1 }
}

/** Turn open registration on or off, upserting the singleton settings row. */
export async function setAllowOpenRegistration(db: DB, open: boolean): Promise<void> {
  const now = Date.now()
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ID))
  if (row) {
    await db
      .update(instanceSettings)
      .set({ allowOpenRegistration: open ? 1 : 0, updatedAt: now })
      .where(eq(instanceSettings.id, INSTANCE_ID))
  } else {
    await db
      .insert(instanceSettings)
      .values({ id: INSTANCE_ID, allowOpenRegistration: open ? 1 : 0, createdAt: now, updatedAt: now })
  }
}
