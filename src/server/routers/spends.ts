import { z } from 'zod'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { spendTransaction, member, pot, category } from '../db/schema'
import { newId } from '../../shared/ids'
import { suggestPot } from '../spending/suggest'
import type { DB } from '../db/client'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

async function validateOwnerAndPot(
  db: DB,
  ownerId: string,
  potId: string | null | undefined,
  categoryId: string | null | undefined,
): Promise<void> {
  const [owner] = await db.select().from(member).where(eq(member.id, ownerId))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
  if (potId) {
    const [p] = await db.select().from(pot).where(eq(pot.id, potId))
    if (!p) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
    }
  }
  if (categoryId) {
    const [c] = await db.select().from(category).where(eq(category.id, categoryId))
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
      if (input?.needsPot) conditions.push(isNull(spendTransaction.potId))

      const where = conditions.length > 0 ? and(...conditions) : undefined

      return ctx.db
        .select()
        .from(spendTransaction)
        .where(where)
        .orderBy(desc(spendTransaction.date), desc(spendTransaction.createdAt))
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
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await validateOwnerAndPot(ctx.db, input.ownerId, input.potId, input.categoryId)

      const now = Date.now()
      const id = newId()

      await ctx.db.insert(spendTransaction).values({
        id,
        date: input.date ?? todayIso(),
        description: input.description,
        amount: input.amount,
        ownerId: input.ownerId,
        potId: input.potId ?? null,
        categoryId: input.categoryId ?? null,
        reconciled: 0,
        source: 'manual',
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })

      const [inserted] = await ctx.db.select().from(spendTransaction).where(eq(spendTransaction.id, id))
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert spend transaction' })
      }
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        date: z.string().optional(),
        description: z.string().min(1).optional(),
        amount: z.number().int().optional(),
        ownerId: z.string().optional(),
        potId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const now = Date.now()

      const [target] = await ctx.db.select().from(spendTransaction).where(eq(spendTransaction.id, id))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Spend transaction not found' })
      }

      await validateOwnerAndPot(
        ctx.db,
        rest.ownerId ?? target.ownerId,
        rest.potId !== undefined ? rest.potId : target.potId,
        rest.categoryId !== undefined ? rest.categoryId : target.categoryId,
      )

      await ctx.db
        .update(spendTransaction)
        .set({ ...rest, updatedAt: now })
        .where(eq(spendTransaction.id, id))

      const [updated] = await ctx.db.select().from(spendTransaction).where(eq(spendTransaction.id, id))
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Spend transaction not found' })
      }
      return updated
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(spendTransaction).where(eq(spendTransaction.id, input.id))
      return { id: input.id }
    }),

  suggestPot: publicProcedure
    .input(z.object({ description: z.string(), ownerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const priors = await ctx.db.select().from(spendTransaction)
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
