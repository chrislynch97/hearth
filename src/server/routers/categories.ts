import { z } from 'zod'
import { asc, eq, isNull, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { category } from '../db/schema'
import { newId } from '../../shared/ids'

export const categoriesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(category)
      .where(scopeWhere(ctx.householdId, category.householdId, isNull(category.archivedAt)))
      .orderBy(asc(category.sortOrder), asc(category.name))
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()

      const [result] = await ctx.db
        .select({ maxOrder: max(category.sortOrder) })
        .from(category)
        .where(scopeWhere(ctx.householdId, category.householdId))
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      const [inserted] = await ctx.db
        .insert(category)
        .values({
          id,
          householdId: ctx.householdId,
          name: input.name,
          sortOrder: nextOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return inserted!
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const now = Date.now()

      await ctx.db
        .update(category)
        .set({ ...fields, updatedAt: now })
        .where(scopeWhere(ctx.householdId, category.householdId, eq(category.id, id)))

      const [updated] = await ctx.db
        .select()
        .from(category)
        .where(scopeWhere(ctx.householdId, category.householdId, eq(category.id, id)))

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' })
      }

      return updated
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(category)
        .where(scopeWhere(ctx.householdId, category.householdId, eq(category.id, input.id)))

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' })
      }

      const now = Date.now()
      await ctx.db
        .update(category)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, category.householdId, eq(category.id, input.id)))
    }),
})
