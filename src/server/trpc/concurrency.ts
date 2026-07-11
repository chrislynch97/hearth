import { eq, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

/**
 * Optimistic locking (issue #23).
 *
 * Every household member shares the same data, so two people editing the same
 * pot / spend / payslip at once used to race: whoever saved last silently
 * clobbered the other's edit. These helpers add a compare-and-swap on the row's
 * `updatedAt` so a stale write is refused and surfaced as a tRPC `CONFLICT`
 * instead of quietly winning.
 *
 * How a guarded update resolver is shaped:
 *
 *   const [written] = await ctx.db
 *     .update(pot)
 *     .set({ ...fields, updatedAt: now })
 *     .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, id),
 *                       versionGuard(pot.updatedAt, input.expectedUpdatedAt)))
 *     .returning()
 *   if (written) return written
 *   // wrote nothing: the row is either gone or was changed under us
 *   const [current] = await ctx.db.select({ id: pot.id }).from(pot)
 *     .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, id)))
 *   throwStaleWrite('Pot', current != null)
 */

/**
 * Input field for an optimistic-locked update: the `updatedAt` the client last
 * read for this row. Optional by design — callers that have the row (every edit
 * form) pass it and get conflict protection; lightweight callers that don't
 * (e.g. a projection without `updatedAt`) omit it and keep last-write-wins.
 */
export const expectedUpdatedAtInput = z.number().int().optional()

/**
 * WHERE fragment enforcing the optimistic lock — pass the result straight into
 * `scopeWhere(...)`, which already tolerates `undefined`. Returns `undefined`
 * (i.e. no guard, last-write-wins) when the client sent no `expectedUpdatedAt`.
 */
export function versionGuard(
  updatedAtColumn: SQLiteColumn,
  expected: number | undefined,
): SQL | undefined {
  return expected === undefined ? undefined : eq(updatedAtColumn, expected)
}

/**
 * Raise the right error when a guarded update matched no rows. `stillExists` is
 * whether the row is still present by id within the household (re-fetched
 * ignoring `updatedAt`): present means someone else saved first (`CONFLICT`),
 * absent means it was removed (`NOT_FOUND`).
 */
export function throwStaleWrite(entity: string, stillExists: boolean): never {
  throw new TRPCError({
    code: stillExists ? 'CONFLICT' : 'NOT_FOUND',
    message: stillExists
      ? `This ${entity.toLowerCase()} was changed by someone else since you opened it. Reload and try again.`
      : `${entity} not found`,
  })
}
