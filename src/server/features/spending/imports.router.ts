import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { assertMember, scopeWhere } from '../../trpc/tenant'
import { recordAudit } from '../../trpc/audit'
import { spendTransaction, importBatch, household } from '../../db/schema'
import { newId } from '../../../shared/ids'
import { parseCsvTable } from '../../../shared/csvParse'
import { mapRows } from './import/map'
import type { MappedRow } from './import/map'
import { getProfile, listProfiles } from './import/profiles'
import { suggestPot } from './suggest'

export interface PreviewRow extends MappedRow {
  suggestedPotId: string | null
}

export const importsRouter = router({
  /** The banks the UI can import from (id, label, export instructions). */
  profiles: publicProcedure.query(() => listProfiles()),

  /** Parse + classify a bank CSV against current data, with pot suggestions,
   *  using the chosen bank profile. Read-only: nothing is written until commit. */
  preview: publicProcedure
    .input(z.object({ ownerId: z.string(), csvText: z.string(), source: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.householdId, input.ownerId)

      const profile = getProfile(input.source)

      const [hh] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
      const decimalPlaces = hh?.currencyDecimalPlaces ?? 2
      const currencyCode = hh?.currencyCode ?? 'GBP'

      const { headers, rows } = parseCsvTable(input.csvText)
      if (rows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No rows found in the CSV file.' })
      }

      // Existing import refs → dedup; existing pot-assigned spends → suggestions.
      const priors = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId))
      const existingRefs = new Set(priors.map((p) => p.importRef).filter((r): r is string => !!r))
      const withPot = priors
        .filter((p) => p.potId !== null)
        .map((p) => ({ description: p.description, ownerId: p.ownerId, potId: p.potId, date: p.date }))

      const { rows: mapped, mapping } = mapRows(
        rows,
        profile,
        { currencyCode, decimalPlaces, existingRefs },
        headers,
      )

      const previewRows: PreviewRow[] = mapped.map((r) => {
        // Only suggest for rows we'd actually import.
        const suggestedPotId =
          r.status === 'new' || r.status === 'foreign'
            ? suggestPot({ description: r.description, ownerId: input.ownerId, priors: withPot }).potId
            : null
        return { ...r, suggestedPotId }
      })

      const summary = {
        total: previewRows.length,
        new: previewRows.filter((r) => r.status === 'new').length,
        foreign: previewRows.filter((r) => r.status === 'foreign').length,
        excluded: previewRows.filter((r) => r.status === 'excluded').length,
        duplicate: previewRows.filter((r) => r.status === 'duplicate').length,
        error: previewRows.filter((r) => r.status === 'error').length,
      }

      return {
        headers,
        rows: previewRows,
        summary,
        currencyCode,
        decimalPlaces,
        source: profile.id,
        mapping,
      }
    }),

  /** Commit the chosen rows: create an ImportBatch and insert the spends
   *  atomically. Re-checks dedup so a double-submit can't duplicate rows. */
  commit: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        filename: z.string().nullable().optional(),
        source: z.string().optional(),
        mapping: z.unknown().optional(),
        totalRows: z.number().int().optional(),
        rows: z
          .array(
            z.object({
              importRef: z.string(),
              date: z.string(),
              description: z.string(),
              amount: z.number().int(),
              potId: z.string().nullable().optional(),
              categoryId: z.string().nullable().optional(),
              note: z.string().nullable().optional(),
              raw: z.record(z.string(), z.string()).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.householdId, input.ownerId)

      const priors = await ctx.db
        .select({ importRef: spendTransaction.importRef })
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId))
      const existingRefs = new Set(priors.map((p) => p.importRef).filter((r): r is string => !!r))

      const now = new Date()
      const batchId = newId()

      // Drop rows already imported (defensive) and any dupes within this payload.
      const seen = new Set<string>()
      const toInsert = input.rows.filter((r) => {
        if (existingRefs.has(r.importRef) || seen.has(r.importRef)) return false
        seen.add(r.importRef)
        return true
      })

      const totalRows = input.totalRows ?? input.rows.length
      const importedCount = toInsert.length
      const skippedCount = totalRows - importedCount

      // One transaction so the batch row and its spends commit atomically (no
      // partial import if a later insert fails). Postgres supports interactive
      // transactions; the old libsql `db.batch` couldn't on an in-memory DB.
      await ctx.db.transaction(async (tx) => {
        await tx.insert(importBatch).values({
          id: batchId,
          householdId: ctx.householdId,
          source: getProfile(input.source).id,
          filename: input.filename ?? null,
          rowCount: totalRows,
          importedCount,
          skippedCount,
          mapping: input.mapping ? JSON.stringify(input.mapping) : null,
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        for (const r of toInsert) {
          await tx.insert(spendTransaction).values({
            id: newId(),
            householdId: ctx.householdId,
            date: r.date,
            description: r.description,
            amount: r.amount,
            ownerId: input.ownerId,
            potId: r.potId ?? null,
            categoryId: r.categoryId ?? null,
            reconciled: 0,
            source: 'import',
            importRef: r.importRef,
            importBatchId: batchId,
            raw: r.raw ? JSON.stringify(r.raw) : null,
            note: r.note ?? null,
            createdAt: now,
            updatedAt: now,
          })
        }
      })

      // One audit entry for the whole import (the batch); each imported spend
      // carries importBatchId back to it, so per-row audit rows would be noise.
      const [batch] = await ctx.db
        .select()
        .from(importBatch)
        .where(scopeWhere(ctx.householdId, importBatch.householdId, eq(importBatch.id, batchId)))
      recordAudit(ctx, { entityType: 'importBatch', entityId: batchId, action: 'create', after: batch })

      return { batchId, imported: importedCount, skipped: skippedCount }
    }),

  /** Past import batches, newest first — for an audit/history view. */
  batches: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(importBatch)
      .where(scopeWhere(ctx.householdId, importBatch.householdId))
    return rows.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())
  }),
})
