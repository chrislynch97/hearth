import { and, eq, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { TRPCError } from '@trpc/server'
import { member } from '../db/schema'
import type { Member } from '../db/schema'
import type { DB } from '../db/client'

/**
 * Id of the original single-tenant household. Until per-user login lands
 * (Phase B), every request resolves to this one household, so the tenancy
 * plumbing can be built and exercised without changing behaviour. Phase B
 * replaces the constant in the tRPC context with a session → membership lookup.
 */
export const DEFAULT_HOUSEHOLD_ID = 'household'

/**
 * Constrain a query to a single household, optionally AND-ed with more
 * conditions. Every tenant-scoped read and write must go through this.
 *
 * This matters most for fetch/update/delete by id: an unscoped
 * `where(eq(table.id, x))` would let one household read or mutate another's row
 * by guessing an id. Pairing the id with the household column closes that hole
 * — the row is found only if it belongs to the caller's household.
 *
 *   .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, input.id)))
 */
export function scopeWhere(
  householdId: string,
  householdColumn: SQLiteColumn,
  ...more: Array<SQL | undefined>
): SQL {
  // `and` with at least one argument always yields a defined SQL.
  return and(eq(householdColumn, householdId), ...more)!
}

/** Return the member `ownerId` names within `householdId`, or throw BAD_REQUEST.
 *  Shared by every router that accepts an `ownerId` referencing a member. */
export async function requireMember(db: DB, householdId: string, ownerId: string): Promise<Member> {
  const [owner] = await db
    .select()
    .from(member)
    .where(scopeWhere(householdId, member.householdId, eq(member.id, ownerId)))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
  return owner
}

/** Throw BAD_REQUEST unless `ownerId` names a member of `householdId`. */
export async function assertMember(db: DB, householdId: string, ownerId: string): Promise<void> {
  await requireMember(db, householdId, ownerId)
}

/** Throw BAD_REQUEST unless `ownerId` names a *person* member (payslips and their
 *  components belong to a person, never the joint entity). */
export async function assertPerson(db: DB, householdId: string, ownerId: string): Promise<void> {
  const owner = await requireMember(db, householdId, ownerId)
  if (owner.kind !== 'person') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This belongs to a person, not the joint entity' })
  }
}

// --- Roles -----------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

/** Higher rank = more privilege. Used for `role >= minimum` checks. */
export const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }

/** True when `role` meets or exceeds `min`. Unknown/absent roles never qualify. */
export function hasRole(role: string | undefined, min: Role): boolean {
  if (role == null) return false
  const rank = ROLE_RANK[role as Role]
  return rank !== undefined && rank >= ROLE_RANK[min]
}

/** Throw FORBIDDEN unless the caller's role meets `min`. */
export function assertRole(role: string | undefined, min: Role): void {
  if (!hasRole(role, min)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `This action requires the ${min} role or higher.` })
  }
}
