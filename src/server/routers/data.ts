import { z } from 'zod'
import { and, count, eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertInstanceOwner, reconcileInstanceOwner } from '../auth/session'
import { assertRole } from '../trpc/tenant'
import { household } from '../db/schema'
import { describeDatabase } from '../db/client'
import { ALL_TABLES, MONEY_COLUMNS } from '../db/tables'
import { ensureSeed } from '../db/seed'
import { rescaleMinor } from '../../shared/money'
import { applySnapshot, buildSnapshot, EXPORT_VERSION } from '../db/snapshot'
import { runBackup } from '../backup/runner'
import { appVersion } from '../version'
import { checkForUpdates } from '../updates'

// NOTE: export / import / reset / stats and the on-disk backup are instance-wide
// (they operate over every table, ALL households) — the self-host backup
// contract. Because they cross household boundaries they're restricted to the
// INSTANCE OWNER (owner of the primary household), not just any household owner:
// otherwise a self-registered tenant owner could read or wipe everyone's data.
// Per-household export/reset is a Phase D concern once hosting makes tenants
// mutually untrusted.

// drizzle's dynamic-table typing is intentionally strict; these thin casts let us
// iterate the table registry generically for whole-database operations.
type AnyTable = PgTable & { id: unknown; householdId: unknown }

export const dataRouter = router({
  /** The portability contract: every table's rows as JSON. */
  export: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    return buildSnapshot(ctx.db)
  }),

  /** Replace all data with a previously exported snapshot (validated, atomic). */
  import: publicProcedure
    .input(
      z.object({
        version: z.number().int(),
        tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertInstanceOwner(ctx.db, ctx.userId)
      if (input.version !== EXPORT_VERSION) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported export version ${input.version}` })
      }
      if (!input.tables['household']?.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Import must contain a household row' })
      }

      // Atomic delete-all + insert-all in a single batch (see makeTestDb note).
      const result = await applySnapshot(ctx.db, input.tables)
      // The snapshot replaced the user table but not `instance_settings` (which
      // isn't exported), so the pre-import owner id + lock flag can now be stale —
      // importing an open snapshot into a locked instance would otherwise strand
      // the owner behind a password that no longer exists (issue #63).
      await reconcileInstanceOwner(ctx.db)
      return result
    }),

  /** Wipe everything and re-seed a blank household (returns to the setup wizard). */
  reset: publicProcedure.mutation(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    await ctx.db.transaction(async (tx) => {
      for (const [, table] of [...ALL_TABLES].reverse()) {
        await tx.delete(table as PgTable)
      }
    })
    await ensureSeed(ctx.db)
    return { ok: true as const }
  }),

  /** Change the currency's decimal places, rescaling every money column to match. */
  rescaleCurrency: publicProcedure
    .input(z.object({ decimalPlaces: z.number().int().min(0).max(4) }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      const [hh] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
      if (!hh) throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })

      const fromDp = hh.currencyDecimalPlaces
      const toDp = input.decimalPlaces

      // Read the money rows, rescale in JS, then write — all in one transaction so
      // a concurrent write between the read and the write can't be silently lost
      // (the read sees a consistent snapshot and the writes commit atomically).
      // Only this household's rows are rescaled (its own decimal-places setting).
      const rescaled = await ctx.db.transaction(async (tx) => {
        let count = 0
        if (fromDp !== toDp) {
          for (const [table, col] of MONEY_COLUMNS) {
            const rows = (await tx
              .select()
              .from(table as PgTable)
              .where(eq((table as AnyTable).householdId as never, ctx.householdId as never))) as Array<
              Record<string, unknown>
            >
            for (const row of rows) {
              const value = row[col]
              if (typeof value !== 'number') continue
              await tx
                .update(table as PgTable)
                .set({ [col]: rescaleMinor(value, fromDp, toDp) })
                .where(
                  and(
                    eq((table as AnyTable).householdId as never, ctx.householdId as never),
                    eq((table as AnyTable).id as never, row['id'] as never),
                  ),
                )
              count += 1
            }
          }
        }
        await tx
          .update(household)
          .set({ currencyDecimalPlaces: toDp, updatedAt: new Date() })
          .where(eq(household.id, ctx.householdId))
        return count
      })

      return { rescaled, decimalPlaces: toDp }
    }),

  /** Write a JSON backup to disk now (the auto-backup, triggered manually). */
  backupNow: publicProcedure.mutation(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    return runBackup(ctx.db, [ctx.householdId])
  }),

  /** Row counts per table + the database location, for the About screen. */
  stats: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    // count() aggregates in the database — selecting the rows just to read
    // `.length` would pull the entire database into memory to render the About
    // screen's row counts.
    const counts: Record<string, number> = {}
    for (const [name, table] of ALL_TABLES) {
      const [row] = await ctx.db.select({ n: count() }).from(table as PgTable)
      counts[name] = row?.n ?? 0
    }
    return { counts, databaseLabel: describeDatabase() }
  }),

  /** The version string the running instance reports (issue #81). */
  version: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    return { version: appVersion() }
  }),

  /** Compare the running version against the latest GitHub release and return
   *  the guided-update details. Degrades gracefully when GitHub is unreachable. */
  checkForUpdates: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    return checkForUpdates()
  }),
})
