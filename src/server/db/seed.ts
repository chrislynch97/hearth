import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { household, member, membership, user } from './schema'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { newId } from '../../shared/ids'

const HOUSEHOLD_ID = DEFAULT_HOUSEHOLD_ID

/** Create a fresh household with its non-deletable joint member, returning the
 *  new id. Used when someone self-registers (M4) — the caller then attaches the
 *  registrant as owner. `householdId` is set explicitly on the joint member
 *  because the column defaults to the singleton household. */
export async function provisionHousehold(
  db: DB,
  opts: { displayName?: string } = {},
): Promise<string> {
  const now = Date.now()
  const householdId = newId()
  await db.insert(household).values({
    id: householdId,
    displayName: opts.displayName?.trim() || 'My Household',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(member).values({
    id: newId(),
    householdId,
    kind: 'joint',
    displayName: 'Joint',
    sortOrder: 100,
    createdAt: now,
    updatedAt: now,
  })
  return householdId
}

/** Ensure the singleton household, the non-deletable joint member, and an owner
 *  user + membership exist. Idempotent. The owner is created password-less (the
 *  instance is open until they set one); existing installs had their shared
 *  household password migrated onto the owner user by migration 0017. */
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

  // Provision the owner account for the default household. On existing installs
  // this carries the shared household password/MFA onto the owner user, so the
  // switch to per-user auth (Phase B) doesn't lock anyone out.
  const owners = await database
    .select()
    .from(membership)
    .where(eq(membership.householdId, HOUSEHOLD_ID))
  if (owners.length === 0) {
    const [hh] = await database.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
    const userId = newId()
    await database.insert(user).values({
      id: userId,
      username: 'owner',
      email: null,
      displayName: hh?.displayName || 'Owner',
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(membership).values({
      id: newId(),
      userId,
      householdId: HOUSEHOLD_ID,
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  }
}
