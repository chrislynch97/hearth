import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { incomeSource, member } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'yearly', 'weekly', 'fortnightly', 'one_off'])
const basisEnum = z.enum(['net', 'gross'])

async function assertMember(db: DB, ownerId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(eq(member.id, ownerId))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
}

export const incomeSourcesRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(incomeSource)
        .where(isNull(incomeSource.archivedAt))
        .orderBy(asc(incomeSource.name))
      return input?.ownerId ? rows.filter((r) => r.ownerId === input.ownerId) : rows
    }),

  create: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        name: z.string().min(1),
        amount: z.number().int(),
        basis: basisEnum.optional(),
        recurrence: recurrenceEnum,
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.ownerId)
      const now = Date.now()
      const id = newId()
      await ctx.db.insert(incomeSource).values({
        id,
        ownerId: input.ownerId,
        name: input.name,
        amount: input.amount,
        basis: input.basis ?? 'net',
        recurrence: input.recurrence,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const [inserted] = await ctx.db.select().from(incomeSource).where(eq(incomeSource.id, id))
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert income source' })
      }
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        amount: z.number().int().optional(),
        basis: basisEnum.optional(),
        recurrence: recurrenceEnum.optional(),
        active: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, active, ...rest } = input
      const now = Date.now()
      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0

      await ctx.db.update(incomeSource).set(setFields).where(eq(incomeSource.id, id))
      const [updated] = await ctx.db.select().from(incomeSource).where(eq(incomeSource.id, id))
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Income source not found' })
      }
      return updated
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db.select().from(incomeSource).where(eq(incomeSource.id, input.id))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Income source not found' })
      }
      const now = Date.now()
      await ctx.db
        .update(incomeSource)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(incomeSource.id, input.id))
    }),
})
