import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole } from '../trpc/tenant'
import { household } from '../db/schema'
import { ALL_TABLES, MONEY_COLUMNS } from '../db/tables'
import { ensureSeed } from '../db/seed'
import { rescaleMinor } from '../../shared/money'
import { buildSnapshot, EXPORT_VERSION } from '../db/snapshot'
import { runBackup } from '../backup/runner'
import type { DB } from '../db/client'

const INSERT_CHUNK = 200

// NOTE: export / import / reset / stats and the on-disk backup are instance-wide
// (they operate over every table, all households). That's the self-host backup
// contract today. Per-household export/reset is a Phase B concern once more than
// one household can share a database.

// drizzle's dynamic-table typing is intentionally strict; these thin casts let us
// iterate the table registry generically for whole-database operations.
type AnyTable = SQLiteTable & { id: unknown; householdId: unknown }

type BatchArg = Parameters<DB['batch']>[0]
type BatchStatement = BatchArg[number]

/** Run statements atomically via libsql's batch API (works on `:memory:`, unlike
 *  interactive transactions). No-op for an empty list. */
async function runBatch(db: DB, statements: BatchStatement[]): Promise<void> {
  if (statements.length === 0) return
  await db.batch(statements as unknown as BatchArg)
}

export const dataRouter = router({
  /** The portability contract: every table's rows as JSON. */
  export: publicProcedure.query(async ({ ctx }) => {
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
      if (input.version !== EXPORT_VERSION) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported export version ${input.version}` })
      }
      if (!input.tables['household']?.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Import must contain a household row' })
      }

      // Atomic delete-all + insert-all in a single batch (see makeTestDb note).
      const statements: BatchStatement[] = []
      for (const [, table] of [...ALL_TABLES].reverse()) {
        statements.push(ctx.db.delete(table as SQLiteTable))
      }
      for (const [name, table] of ALL_TABLES) {
        const rows = input.tables[name] ?? []
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          const chunk = rows.slice(i, i + INSERT_CHUNK)
          if (chunk.length > 0) {
            statements.push(ctx.db.insert(table as SQLiteTable).values(chunk as never))
          }
        }
      }
      await runBatch(ctx.db, statements)

      return Object.fromEntries(ALL_TABLES.map(([n]) => [n, (input.tables[n] ?? []).length]))
    }),

  /** Wipe everything and re-seed a blank household (returns to the setup wizard). */
  reset: publicProcedure.mutation(async ({ ctx }) => {
    assertRole(ctx.role, 'owner')
    const statements = [...ALL_TABLES]
      .reverse()
      .map(([, table]) => ctx.db.delete(table as SQLiteTable))
    await runBatch(ctx.db, statements)
    await ensureSeed(ctx.db)
    return { ok: true as const }
  }),

  /** Change the currency's decimal places, rescaling every money column to match. */
  rescaleCurrency: publicProcedure
    .input(z.object({ decimalPlaces: z.number().int().min(0).max(4) }))
    .mutation(async ({ ctx, input }) => {
      const [hh] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
      if (!hh) throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })

      const fromDp = hh.currencyDecimalPlaces
      const toDp = input.decimalPlaces

      // Read current values, then apply all changes atomically in one batch. Only
      // this household's rows are rescaled (its own decimal-places setting).
      const statements: BatchStatement[] = []
      let rescaled = 0
      if (fromDp !== toDp) {
        for (const [table, col] of MONEY_COLUMNS) {
          const rows = (await ctx.db
            .select()
            .from(table as SQLiteTable)
            .where(eq((table as AnyTable).householdId as never, ctx.householdId as never))) as Array<
            Record<string, unknown>
          >
          for (const row of rows) {
            const value = row[col]
            if (typeof value !== 'number') continue
            statements.push(
              ctx.db
                .update(table as SQLiteTable)
                .set({ [col]: rescaleMinor(value, fromDp, toDp) })
                .where(
                  and(
                    eq((table as AnyTable).householdId as never, ctx.householdId as never),
                    eq((table as AnyTable).id as never, row['id'] as never),
                  ),
                ),
            )
            rescaled += 1
          }
        }
      }
      statements.push(
        ctx.db
          .update(household)
          .set({ currencyDecimalPlaces: toDp, updatedAt: Date.now() })
          .where(eq(household.id, ctx.householdId)),
      )
      await runBatch(ctx.db, statements)

      return { rescaled, decimalPlaces: toDp }
    }),

  /** Write a JSON backup to disk now (the auto-backup, triggered manually). */
  backupNow: publicProcedure.mutation(async ({ ctx }) => {
    return runBackup(ctx.db)
  }),

  /** Row counts per table + the database location, for the About screen. */
  stats: publicProcedure.query(async ({ ctx }) => {
    const counts: Record<string, number> = {}
    for (const [name, table] of ALL_TABLES) {
      const rows = await ctx.db.select().from(table as SQLiteTable)
      counts[name] = rows.length
    }
    return { counts, databaseUrl: process.env.DATABASE_URL ?? 'file:./data/app.db' }
  }),
})
