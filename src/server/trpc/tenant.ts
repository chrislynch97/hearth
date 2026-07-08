import { and, eq, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { TRPCError } from '@trpc/server'

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
