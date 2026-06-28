import { z } from 'zod'
import { asc, eq, isNull, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { pot, member } from '../db/schema'
import { newId } from '../../shared/ids'

export const potsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(pot)
      .where(isNull(pot.archivedAt))
      .orderBy(asc(pot.sortOrder), asc(pot.name))
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        ownerId: z.string(),
        isDrawdown: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()

      // Validate ownerId
      const [owner] = await ctx.db.select().from(member).where(eq(member.id, input.ownerId))
      if (!owner) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
      }

      const [result] = await ctx.db.select({ maxOrder: max(pot.sortOrder) }).from(pot)
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      await ctx.db.insert(pot).values({
        id,
        name: input.name,
        categoryId: input.categoryId ?? null,
        ownerId: input.ownerId,
        isDrawdown: input.isDrawdown ? 1 : 0,
        sortOrder: nextOrder,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })

      const [inserted] = await ctx.db.select().from(pot).where(eq(pot.id, id))

      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert pot' })
      }

      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        categoryId: z.string().nullable().optional(),
        ownerId: z.string().optional(),
        isDrawdown: z.boolean().optional(),
        note: z.string().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, isDrawdown, ownerId, ...rest } = input
      const now = Date.now()

      // Validate ownerId if provided
      if (ownerId !== undefined) {
        const [owner] = await ctx.db.select().from(member).where(eq(member.id, ownerId))
        if (!owner) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
        }
      }

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (ownerId !== undefined) setFields['ownerId'] = ownerId
      if (isDrawdown !== undefined) setFields['isDrawdown'] = isDrawdown ? 1 : 0

      await ctx.db.update(pot).set(setFields).where(eq(pot.id, id))

      const [updated] = await ctx.db.select().from(pot).where(eq(pot.id, id))

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pot not found' })
      }

      return updated
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db.select().from(pot).where(eq(pot.id, input.id))

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pot not found' })
      }

      const now = Date.now()
      await ctx.db
        .update(pot)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(pot.id, input.id))
    }),
})
