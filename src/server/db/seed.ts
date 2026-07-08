import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { household, member, membership, user } from './schema'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { newId } from '../../shared/ids'

const HOUSEHOLD_ID = DEFAULT_HOUSEHOLD_ID

/** Ensure the singleton household, the non-deletable joint member, and an owner
 *  user + membership exist. Idempotent. The owner user inherits any shared
 *  household password/MFA so the login keeps working once auth moves to users. */
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
      passwordHash: hh?.passwordHash ?? null,
      mfaSecret: hh?.mfaSecret ?? null,
      mfaEnabledAt: hh?.mfaEnabledAt ?? null,
      mfaRecoveryCodes: hh?.mfaRecoveryCodes ?? null,
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
