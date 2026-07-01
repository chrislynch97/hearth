import { z } from 'zod'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { spendTransaction, pot, reconciliationBatch } from '../db/schema'
import { newId } from '../../shared/ids'
import { computeBacklog } from '../spending/backlog'

export const reconcileRouter = router({
  backlog: publicProcedure.query(async ({ ctx }) => {
    const transactions = await ctx.db
      .select()
      .from(spendTransaction)
      .where(eq(spendTransaction.reconciled, 0))

    const pots = await ctx.db.select().from(pot).where(isNull(pot.archivedAt))

    return computeBacklog({
      transactions: transactions.map((t) => ({
        potId: t.potId,
        amount: t.amount,
        reconciled: t.reconciled === 1,
        ownerId: t.ownerId,
      })),
      pots: pots.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId })),
    })
  }),

  markPotMoved: publicProcedure
    .input(z.object({ potId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(spendTransaction)
        .where(and(eq(spendTransaction.potId, input.potId), eq(spendTransaction.reconciled, 0)))

      if (rows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No unreconciled transactions for this pot' })
      }

      const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
      const transactionCount = rows.length

      const now = Date.now()
      const batchId = newId()

      await ctx.db.insert(reconciliationBatch).values({
        id: batchId,
        potId: input.potId,
        totalAmount,
        transactionCount,
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db
        .update(spendTransaction)
        .set({ reconciled: 1, reconciledAt: now, reconciliationBatchId: batchId, updatedAt: now })
        .where(and(eq(spendTransaction.potId, input.potId), eq(spendTransaction.reconciled, 0)))

      const [batch] = await ctx.db.select().from(reconciliationBatch).where(eq(reconciliationBatch.id, batchId))
      if (!batch) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create reconciliation batch' })
      }
      return batch
    }),

  undoBatch: publicProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [batch] = await ctx.db.select().from(reconciliationBatch).where(eq(reconciliationBatch.id, input.batchId))
      if (!batch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reconciliation batch not found' })
      }

      const now = Date.now()

      await ctx.db
        .update(reconciliationBatch)
        .set({ reversedAt: now, updatedAt: now })
        .where(eq(reconciliationBatch.id, input.batchId))

      await ctx.db
        .update(spendTransaction)
        .set({ reconciled: 0, reconciledAt: null, reconciliationBatchId: null, updatedAt: now })
        .where(eq(spendTransaction.reconciliationBatchId, input.batchId))

      return { batchId: input.batchId }
    }),

  batches: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(reconciliationBatch).orderBy(desc(reconciliationBatch.createdAt))
  }),
})
