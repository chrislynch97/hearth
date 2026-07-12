import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertMember, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { recordAudit } from '../trpc/audit'
import { spendTransaction, pot, category, reconciliationBatch } from '../db/schema'
import { newId } from '../../shared/ids'
import { suggestPot } from '../spending/suggest'
import type { DB } from '../db/client'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

async function validateOwnerAndPot(
  db: DB,
  householdId: string,
  ownerId: string,
  potId: string | null | undefined,
  categoryId: string | null | undefined,
): Promise<void> {
  await assertMember(db, householdId, ownerId)
  if (potId) {
    const [p] = await db.select().from(pot).where(scopeWhere(householdId, pot.householdId, eq(pot.id, potId)))
    if (!p) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
    }
  }
  if (categoryId) {
    const [c] = await db.select().from(category).where(scopeWhere(householdId, category.householdId, eq(category.id, categoryId)))
    if (!c) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'categoryId does not refer to an existing category' })
    }
  }
}

export const spendsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          ownerId: z.string().optional(),
          potId: z.string().optional(),
          reconciled: z.boolean().optional(),
          needsPot: z.boolean().optional(),
          // Cap the rows returned (the Spending register pages through history so
          // it never loads the whole table at once). Omit for the full list.
          limit: z.number().int().min(1).max(10000).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.ownerId !== undefined) conditions.push(eq(spendTransaction.ownerId, input.ownerId))
      if (input?.potId !== undefined) conditions.push(eq(spendTransaction.potId, input.potId))
      if (input?.reconciled !== undefined) {
        conditions.push(eq(spendTransaction.reconciled, input.reconciled ? 1 : 0))
      }
      // "Needs a pot" = genuinely unassigned, i.e. no pot AND not settled at source.
      // A main-account spend (potId null, settledAtSource=1) is deliberately pot-less.
      if (input?.needsPot) {
        conditions.push(isNull(spendTransaction.potId))
        conditions.push(eq(spendTransaction.settledAtSource, 0))
      }

      const base = ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, ...conditions))
        .orderBy(desc(spendTransaction.date), desc(spendTransaction.createdAt))
      return input?.limit !== undefined ? base.limit(input.limit) : base
    }),

  add: publicProcedure
    .input(
      z.object({
        date: z.string().optional(),
        description: z.string().min(1),
        amount: z.number().int(),
        ownerId: z.string(),
        potId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        // "Already came out / no transfer needed" — a pot auto-deduction (Monzo)
        // or a main-account spend. Keeps it off the catch-up backlog.
        settledAtSource: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await validateOwnerAndPot(ctx.db, ctx.householdId, input.ownerId, input.potId, input.categoryId)

      const now = new Date()
      const id = newId()

      const [inserted] = await ctx.db
        .insert(spendTransaction)
        .values({
          id,
          householdId: ctx.householdId,
          date: input.date ?? todayIso(),
          description: input.description,
          amount: input.amount,
          ownerId: input.ownerId,
          potId: input.potId ?? null,
          categoryId: input.categoryId ?? null,
          settledAtSource: input.settledAtSource ? 1 : 0,
          reconciled: 0,
          source: 'manual',
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      recordAudit(ctx, { entityType: 'spend', entityId: id, action: 'create', after: inserted })
      return inserted!
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        date: z.string().optional(),
        description: z.string().min(1).optional(),
        amount: z.number().int().optional(),
        ownerId: z.string().optional(),
        potId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        settledAtSource: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, settledAtSource, ...rest } = input
      const now = new Date()

      const [target] = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, id)))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Spend transaction not found' })
      }

      await validateOwnerAndPot(
        ctx.db,
        ctx.householdId,
        rest.ownerId ?? target.ownerId,
        rest.potId !== undefined ? rest.potId : target.potId,
        rest.categoryId !== undefined ? rest.categoryId : target.categoryId,
      )

      const [updated] = await ctx.db
        .update(spendTransaction)
        .set({ ...rest, ...(settledAtSource !== undefined ? { settledAtSource: settledAtSource ? 1 : 0 } : {}), updatedAt: now })
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, id), versionGuard(spendTransaction.updatedAt, expectedUpdatedAt)))
        .returning()
      if (updated) {
        recordAudit(ctx, { entityType: 'spend', entityId: id, action: 'update', before: target, after: updated })
        return updated
      }

      const [current] = await ctx.db
        .select({ id: spendTransaction.id })
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, id)))
      throwStaleWrite('Spend', current != null)
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, input.id)))
      await ctx.db
        .delete(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, input.id)))
      if (target) {
        recordAudit(ctx, { entityType: 'spend', entityId: input.id, action: 'delete', before: target })
      }

      // If this spend was part of a reconciliation batch, keep that batch honest.
      // Recompute its totals from what's left, and delete it entirely once its
      // last transaction is gone — otherwise the batch lingers forever in the
      // Catch-up history with nothing behind it and no way to clear it.
      if (target?.reconciliationBatchId) {
        const remaining = await ctx.db
          .select()
          .from(spendTransaction)
          .where(
            scopeWhere(
              ctx.householdId,
              spendTransaction.householdId,
              eq(spendTransaction.reconciliationBatchId, target.reconciliationBatchId),
            ),
          )
        if (remaining.length === 0) {
          await ctx.db
            .delete(reconciliationBatch)
            .where(
              scopeWhere(
                ctx.householdId,
                reconciliationBatch.householdId,
                eq(reconciliationBatch.id, target.reconciliationBatchId),
              ),
            )
        } else {
          await ctx.db
            .update(reconciliationBatch)
            .set({
              totalAmount: remaining.reduce((sum, r) => sum + r.amount, 0),
              transactionCount: remaining.length,
              updatedAt: new Date(),
            })
            .where(
              scopeWhere(
                ctx.householdId,
                reconciliationBatch.householdId,
                eq(reconciliationBatch.id, target.reconciliationBatchId),
              ),
            )
        }
      }

      return { id: input.id }
    }),

  /** Replace one spend with several rows that sum to the original, each with its
   *  own owner/pot. The rows share a split_group_id; the original row becomes the
   *  first part (keeping its date, description and source). */
  split: publicProcedure
    .input(
      z.object({
        id: z.string(),
        parts: z
          .array(
            z.object({
              amount: z.number().int(),
              ownerId: z.string(),
              potId: z.string().nullable().optional(),
              categoryId: z.string().nullable().optional(),
              note: z.string().nullable().optional(),
            }),
          )
          .min(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [original] = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, input.id)))
      if (!original) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Spend transaction not found' })
      }
      if (original.reconciled === 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A reconciled spend cannot be split. Undo its reconciliation first.' })
      }

      const total = input.parts.reduce((acc, p) => acc + p.amount, 0)
      if (total !== original.amount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Split parts must sum to the original amount (${original.amount}); got ${total}.`,
        })
      }

      for (const part of input.parts) {
        await validateOwnerAndPot(ctx.db, ctx.householdId, part.ownerId, part.potId, part.categoryId)
      }

      const now = new Date()
      const splitGroupId = newId()
      const [first, ...rest] = input.parts

      // Turn the original row into the first part (preserves date/description/source).
      await ctx.db
        .update(spendTransaction)
        .set({
          amount: first!.amount,
          ownerId: first!.ownerId,
          potId: first!.potId ?? null,
          categoryId: first!.categoryId ?? null,
          note: first!.note ?? original.note,
          splitGroupId,
          updatedAt: now,
        })
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.id, original.id)))

      for (const part of rest) {
        await ctx.db.insert(spendTransaction).values({
          id: newId(),
          householdId: ctx.householdId,
          date: original.date,
          description: original.description,
          amount: part.amount,
          ownerId: part.ownerId,
          potId: part.potId ?? null,
          categoryId: part.categoryId ?? null,
          reconciled: 0,
          source: original.source,
          splitGroupId,
          note: part.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
      }

      const group = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId, eq(spendTransaction.splitGroupId, splitGroupId)))

      // The original row was reshaped into the first part; the rest are brand new.
      for (const row of group) {
        if (row.id === original.id) {
          recordAudit(ctx, { entityType: 'spend', entityId: row.id, action: 'update', before: original, after: row })
        } else {
          recordAudit(ctx, { entityType: 'spend', entityId: row.id, action: 'create', after: row })
        }
      }
      return group
    }),

  suggestPot: publicProcedure
    .input(z.object({ description: z.string(), ownerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const priors = await ctx.db
        .select()
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId))
      const withPot = priors.filter((p) => p.potId !== null)
      return suggestPot({
        description: input.description,
        ownerId: input.ownerId,
        priors: withPot.map((p) => ({
          description: p.description,
          ownerId: p.ownerId,
          potId: p.potId,
          date: p.date,
        })),
      })
    }),
})
