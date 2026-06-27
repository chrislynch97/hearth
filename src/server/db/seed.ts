import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { household, member } from './schema'
import { newId } from '../../shared/ids'

const HOUSEHOLD_ID = 'household'

/** Ensure the singleton household row and the single non-deletable joint member exist. Idempotent. */
export async function ensureSeed(database: DB): Promise<void> {
  const now = Date.now()
  const existing = await database.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
  if (existing.length === 0) {
    await database.insert(household).values({ id: HOUSEHOLD_ID, createdAt: now, updatedAt: now })
  }
  const joint = await database.select().from(member).where(eq(member.kind, 'joint'))
  if (joint.length === 0) {
    await database.insert(member).values({
      id: newId(),
      kind: 'joint',
      displayName: 'Joint',
      sortOrder: 100,
      createdAt: now,
      updatedAt: now,
    })
  }
}
