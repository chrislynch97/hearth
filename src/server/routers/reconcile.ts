import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { spendTransaction, pot, reconciliationBatch } from '../db/schema'
import type { ReconciliationBatch } from '../db/schema'
import type { DBOrTx } from '../db/client'
import { newId } from '../../shared/ids'
import { computeBacklog, type BacklogResidual } from '../spending/backlog'

/** A batch's contribution to its pot/payer residual: what was required minus what
 *  actually moved. `movedAmount` null means "moved in full", i.e. no residual. */
function residualOf(batch: Pick<ReconciliationBatch, 'totalAmount' | 'movedAmount'>): number {
  return batch.movedAmount === null ? 0 : batch.totalAmount - batch.movedAmount
}

const residualKey = (potId: string | null, ownerId: string | null) => `${potId ?? ''}::${ownerId ?? ''}`

/** Outstanding residual per (pot, payer), summed across every live (non-reversed)
 *  batch. Reversing a batch drops its contribution automatically, so undo reverses
 *  a residual for free. Only pot-scoped batches can carry a surfaceable residual. */
async function outstandingResiduals(ctx: { db: DBOrTx; householdId: string }): Promise<Map<string, number>> {
  const batches = await ctx.db
    .select()
    .from(reconciliationBatch)
    .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId, isNull(reconciliationBatch.reversedAt)))

  const byKey = new Map<string, number>()
  for (const b of batches) {
    if (b.potId === null) continue
    const delta = residualOf(b)
    if (delta === 0) continue
    byKey.set(residualKey(b.potId, b.ownerId), (byKey.get(residualKey(b.potId, b.ownerId)) ?? 0) + delta)
  }
  return byKey
}

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

    const residualMap = await outstandingResiduals(ctx)
    const residuals: BacklogResidual[] = []
    for (const [key, amount] of residualMap) {
      if (amount === 0) continue
      const [potId, ownerId] = key.split('::')
      residuals.push({ potId: potId!, ownerId: ownerId!, amount })
    }

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
      residuals,
    })
  }),

  /**
   * Mark a pot's outstanding spends as moved. Scopes to a single payer when
   * `ownerId` is given (the per-payer catch-up row — "→ Ava £20"), else settles
   * the whole pot. Never touches `settledAtSource` rows: those needed no transfer.
   *
   * `movedAmount` is what actually left the account. Omit it (or pass the full
   * required amount when nothing is carried over) for today's one-click "moved in
   * full" behaviour. When it differs from what was required, the gap becomes a
   * pot-level residual that resurfaces on the next catch-up (issue #72).
   */
  markPotMoved: publicProcedure
    .input(z.object({ potId: z.string(), ownerId: z.string().nullable().optional(), movedAmount: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = input.ownerId ?? null
      const scope = () =>
        scopeWhere(
          ctx.householdId,
          spendTransaction.householdId,
          eq(spendTransaction.potId, input.potId),
          eq(spendTransaction.reconciled, 0),
          eq(spendTransaction.settledAtSource, 0),
          ...(ownerId ? [eq(spendTransaction.ownerId, ownerId)] : []),
        )

      const rows = await ctx.db.select().from(spendTransaction).where(scope())

      if (rows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No unreconciled transactions for this pot' })
      }

      // `totalAmount` = what these spends required. The amount to move also carries
      // any residual owed from earlier part-moves, so that's what `movedAmount`
      // defaults to and what the client pre-fills the field with.
      const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
      const transactionCount = rows.length
      const residuals = await outstandingResiduals(ctx)
      const carried = residuals.get(residualKey(input.potId, ownerId)) ?? 0
      const required = totalAmount + carried
      const moved = input.movedAmount ?? required

      // Store null when this is a plain "moved exactly what was required, nothing
      // carried" — keeps history truthful and identical to the pre-#72 one-click.
      const movedAmount = carried === 0 && moved === totalAmount ? null : moved

      const now = new Date()
      const batchId = newId()

      const [batch] = await ctx.db
        .insert(reconciliationBatch)
        .values({
          id: batchId,
          householdId: ctx.householdId,
          potId: input.potId,
          ownerId,
          totalAmount,
          movedAmount,
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

  /**
   * Write off a pot/payer's outstanding residual (issue #72). Small rounding
   * shortfalls would otherwise nag on catch-up forever. Recorded as a zero-spend
   * batch carrying the cleared amount in `movedAmount`, so its `0 − movedAmount`
   * contribution cancels the residual and an undo restores it like any other batch.
   */
  clearResidual: publicProcedure
    .input(z.object({ potId: z.string(), ownerId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = input.ownerId ?? null
      const residuals = await outstandingResiduals(ctx)
      const outstanding = residuals.get(residualKey(input.potId, ownerId)) ?? 0
      if (outstanding === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No residual to clear for this pot' })
      }

      const now = new Date()
      const batchId = newId()
      const [batch] = await ctx.db
        .insert(reconciliationBatch)
        .values({
          id: batchId,
          householdId: ctx.householdId,
          potId: input.potId,
          ownerId,
          totalAmount: 0,
          movedAmount: outstanding,
          transactionCount: 0,
          note: 'Residual written off',
          createdAt: now,
          updatedAt: now,
        })
        .returning()

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
