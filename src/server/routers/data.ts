import { z } from 'zod'
import { and, count, eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertInstanceOwner, reconcileInstanceOwner } from '../auth/session'
import { assertRole } from '../trpc/tenant'
import { household } from '../db/schema'
// From target, not client: importing client opens (or creates) the real
// database as a module side effect — every test importing appRouter would
// boot a file-backed PGlite on ./data/pgdata.
import { describeDatabase } from '../db/target'
import { ALL_TABLES, MONEY_COLUMNS } from '../db/tables'
import { ensureSeed } from '../db/seed'
import { rescaleMinor } from '../../shared/money'
import { applySnapshot, buildHouseholdSnapshot, buildSnapshot, EXPORT_VERSION } from '../db/snapshot'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { runBackup } from '../backup/runner'
import { appVersion } from '../version'
import { checkForUpdates, deployMode } from '../updates'
import { getInstanceSettings, setUpdateSettings } from '../db/instanceSettings'
import { getCachedUpdateStatus } from '../updateScheduler'
import { isUpdaterOnline, isUpdatePending, readUpdateResult, requestUpdate } from '../updater'
import { recordSecurityEvent } from '../trpc/audit'

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

  /** GDPR portability (issue #110): this household's own data as JSON, in the
   *  same shape as the instance-wide `export` but scoped to the caller's active
   *  household. Authorised by household ownership, not instance ownership — the
   *  tenant-facing counterpart to `export` for when hosting makes tenants mutually
   *  untrusted. Credentials are stripped from the exported user rows. */
  exportHousehold: publicProcedure.query(async ({ ctx }) => {
    assertRole(ctx.role, 'owner')
    return buildHouseholdSnapshot(ctx.db, ctx.householdId)
  }),

  /** GDPR erasure (issue #110): permanently delete the caller's active household
   *  and everything under it. The FK cascades from `household` remove every child
   *  row, its memberships, invitations, audit trail and sessions. Household-owner
   *  only. The primary/instance household is refused — wiping it is the
   *  instance-wide `reset`, not tenant self-service. */
  eraseHousehold: publicProcedure.mutation(async ({ ctx }) => {
    assertRole(ctx.role, 'owner')
    if (ctx.householdId === DEFAULT_HOUSEHOLD_ID) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'The primary household can’t be erased here — use Reset all data instead.',
      })
    }
    // Record against the primary household: erasing this one cascades away its own
    // audit trail, so an entry on it would vanish with the rest of its data.
    recordSecurityEvent(ctx, {
      entityType: 'household',
      entityId: ctx.householdId,
      action: 'household_erased',
      householdId: DEFAULT_HOUSEHOLD_ID,
    })
    await ctx.db.delete(household).where(eq(household.id, ctx.householdId))
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
   *  the guided-update details. Degrades gracefully when GitHub is unreachable.
   *  On-demand: fired by the "Check for updates" button. */
  checkForUpdates: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    return checkForUpdates()
  }),

  /** The cheap, cached update status for the app-wide banner and background
   *  polling. Uses the scheduler's last cached poll; falls back to a live check
   *  when nothing has been cached yet (e.g. auto-poll just turned on). */
  updateStatus: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    const cached = getCachedUpdateStatus()
    if (cached) return { ...cached.status, polledAt: cached.polledAt }
    return { ...(await checkForUpdates()), polledAt: Date.now() }
  }),

  /** The owner's update preferences + how this instance is deployed. `updaterOnline`
   *  is true when a host updater is present (fresh heartbeat) — it gates the
   *  one-click "Update now" button and the auto-update option. */
  updateSettings: publicProcedure.query(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    const s = await getInstanceSettings(ctx.db)
    return {
      autoPoll: s.autoPoll,
      preUpdateBackup: s.preUpdateBackup,
      autoUpdate: s.autoUpdate,
      autoUpdateTime: s.autoUpdateTime,
      deployMode: deployMode(),
      updaterOnline: isUpdaterOnline(),
      updatePending: isUpdatePending(),
      updateResult: readUpdateResult(),
    }
  }),

  /** Persist the update preferences (owner-only, audited). */
  setUpdateSettings: publicProcedure
    .input(
      z.object({
        autoPoll: z.boolean().optional(),
        preUpdateBackup: z.boolean().optional(),
        autoUpdate: z.boolean().optional(),
        autoUpdateTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'Expected HH:MM')
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertInstanceOwner(ctx.db, ctx.userId)
      await setUpdateSettings(ctx.db, input)
      recordSecurityEvent(ctx, {
        entityType: 'instance',
        entityId: 'updates',
        action: 'update_settings_changed',
        details: input,
      })
      return { ok: true as const }
    }),

  /** One-click apply: back up first (if enabled), then ask the host updater to
   *  pull + recreate. Owner-only; requires a host updater to be online. The app
   *  never touches Docker — it only writes the request file. */
  applyUpdate: publicProcedure.mutation(async ({ ctx }) => {
    await assertInstanceOwner(ctx.db, ctx.userId)
    if (!isUpdaterOnline()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No host updater is running — apply the update from the host instead.',
      })
    }
    const settings = await getInstanceSettings(ctx.db)
    if (settings.preUpdateBackup) {
      await runBackup(ctx.db, [ctx.householdId])
    }
    const latest = getCachedUpdateStatus()?.status.latest ?? null
    recordSecurityEvent(ctx, {
      entityType: 'instance',
      entityId: 'updates',
      action: 'update_applied',
      details: { toVersion: latest, via: 'manual', backupFirst: settings.preUpdateBackup },
    })
    requestUpdate(latest)
    return { ok: true as const }
  }),
})
