import { and, eq, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

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
