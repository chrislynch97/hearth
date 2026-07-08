import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { spendTransaction, member, importBatch, household } from '../db/schema'
import { newId } from '../../shared/ids'
import { parseCsvTable } from '../../shared/csvParse'
import { mapMonzoRows } from '../import/monzo'
import type { MappedRow } from '../import/monzo'
import { suggestPot } from '../spending/suggest'
import type { DB } from '../db/client'

type BatchArg = Parameters<DB['batch']>[0]

async function assertMember(db: DB, householdId: string, ownerId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(scopeWhere(householdId, member.householdId, eq(member.id, ownerId)))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
}

export interface PreviewRow extends MappedRow {
  suggestedPotId: string | null
}

export const importsRouter = router({
  /** Parse + classify a Monzo CSV against current data, with pot suggestions.
   *  Read-only: nothing is written until commit. */
  preview: publicProcedure
    .input(z.object({ ownerId: z.string(), csvText: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.householdId, input.ownerId)

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

      const mapped = mapMonzoRows(rows, { currencyCode, decimalPlaces, existingRefs })

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

      return { headers, rows: previewRows, summary, currencyCode, decimalPlaces }
    }),

  /** Commit the chosen rows: create an ImportBatch and insert the spends
   *  atomically. Re-checks dedup so a double-submit can't duplicate rows. */
  commit: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        filename: z.string().nullable().optional(),
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

      const now = Date.now()
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

      const statements = [
        ctx.db.insert(importBatch).values({
          id: batchId,
          householdId: ctx.householdId,
          source: 'monzo_csv',
          filename: input.filename ?? null,
          rowCount: totalRows,
          importedCount,
          skippedCount,
          mapping: null,
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        ...toInsert.map((r) =>
          ctx.db.insert(spendTransaction).values({
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
          }),
        ),
      ]
      await ctx.db.batch(statements as unknown as BatchArg)

      return { batchId, imported: importedCount, skipped: skippedCount }
    }),

  /** Past import batches, newest first — for an audit/history view. */
  batches: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(importBatch)
      .where(scopeWhere(ctx.householdId, importBatch.householdId))
    return rows.sort((a, b) => b.importedAt - a.importedAt)
  }),
})
