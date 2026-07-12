import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { spendTransaction, pot, reconciliationBatch } from '../db/schema'
import { newId } from '../../shared/ids'
import { computeBacklog } from '../spending/backlog'

export const reconcileRouter = router({
  backlog: publicProcedure.query(async ({ ctx }) => {
    const transactions = await ctx.db
      .select()
      .from(spendTransaction)
      .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.reconciled, 0)))

    const pots = await ctx.db
      .select()
      .from(pot)
      .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))

    return computeBacklog({
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        potId: t.potId,
        amount: t.amount,
        reconciled: t.reconciled === 1,
        settledAtSource: t.settledAtSource === 1,
        ownerId: t.ownerId,
      })),
      pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
    })
  }),

  /**
   * Mark a pot's outstanding spends as moved. Scopes to a single payer when
   * `ownerId` is given (the per-payer catch-up row — "→ Ava £20"), else settles
   * the whole pot. Never touches `settledAtSource` rows: those needed no transfer.
   */
  markPotMoved: publicProcedure
    .input(z.object({ potId: z.string(), ownerId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = () =>
        scopeWhere(
          ctx.householdId,
          spendTransaction.householdId,
          eq(spendTransaction.potId, input.potId),
          eq(spendTransaction.reconciled, 0),
          eq(spendTransaction.settledAtSource, 0),
          ...(input.ownerId ? [eq(spendTransaction.ownerId, input.ownerId)] : []),
        )

      const rows = await ctx.db.select().from(spendTransaction).where(scope())

      if (rows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No unreconciled transactions for this pot' })
      }

      const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
      const transactionCount = rows.length

      const now = new Date()
      const batchId = newId()

      const [batch] = await ctx.db
        .insert(reconciliationBatch)
        .values({
          id: batchId,
          householdId: ctx.householdId,
          potId: input.potId,
          ownerId: input.ownerId ?? null,
          totalAmount,
          transactionCount,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      await ctx.db
        .update(spendTransaction)
        .set({ reconciled: 1, reconciledAt: now, reconciliationBatchId: batchId, updatedAt: now })
        .where(scope())

      recordAudit(ctx, { entityType: 'reconciliationBatch', entityId: batchId, action: 'create', after: batch })
      return batch!
    }),

  undoBatch: publicProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [batch] = await ctx.db
        .select()
        .from(reconciliationBatch)
        .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId, eq(reconciliationBatch.id, input.batchId)))
      if (!batch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reconciliation batch not found' })
      }

      const now = new Date()

      await ctx.db
        .update(reconciliationBatch)
        .set({ reversedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId, eq(reconciliationBatch.id, input.batchId)))

      await ctx.db
        .update(spendTransaction)
        .set({ reconciled: 0, reconciledAt: null, reconciliationBatchId: null, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            spendTransaction.householdId,
            eq(spendTransaction.reconciliationBatchId, input.batchId),
          ),
        )

      const [after] = await ctx.db
        .select()
        .from(reconciliationBatch)
        .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId, eq(reconciliationBatch.id, input.batchId)))
      recordAudit(ctx, { entityType: 'reconciliationBatch', entityId: input.batchId, action: 'update', before: batch, after })
      return { batchId: input.batchId }
    }),

  batches: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(reconciliationBatch)
      .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId))
      .orderBy(desc(reconciliationBatch.createdAt))
  }),
})
