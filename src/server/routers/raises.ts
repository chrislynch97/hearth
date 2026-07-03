import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { member, raise } from '../db/schema'
import type { Raise } from '../db/schema'
import { newId } from '../../shared/ids'
import { percentIncrease } from '../income/raises'
import type { DB } from '../db/client'

export interface RaiseWithIncrease extends Raise {
  percentIncrease: number | null
}

async function assertPerson(db: DB, ownerId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(eq(member.id, ownerId))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
  if (owner.kind !== 'person') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Raises belong to a person, not the joint entity' })
  }
}

export const raisesRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(raise).orderBy(asc(raise.effectiveDate))
      const scoped = input?.ownerId ? rows.filter((r) => r.ownerId === input.ownerId) : rows

      // percent_increase is computed per owner against that owner's prior raise.
      return scoped.map((r): RaiseWithIncrease => {
        const ownerRaises = rows.filter((x) => x.ownerId === r.ownerId)
        return { ...r, percentIncrease: percentIncrease(ownerRaises, r.id) }
      })
    }),

  create: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        effectiveDate: z.string(),
        newSalary: z.number().int(),
        bonus: z.number().int().nullable().optional(),
        newPosition: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPerson(ctx.db, input.ownerId)
      const now = Date.now()
      const id = newId()
      await ctx.db.insert(raise).values({
        id,
        ownerId: input.ownerId,
        effectiveDate: input.effectiveDate,
        newSalary: input.newSalary,
        bonus: input.bonus ?? null,
        newPosition: input.newPosition ?? null,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const [inserted] = await ctx.db.select().from(raise).where(eq(raise.id, id))
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert raise' })
      }
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        effectiveDate: z.string().optional(),
        newSalary: z.number().int().optional(),
        bonus: z.number().int().nullable().optional(),
        newPosition: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const now = Date.now()
      await ctx.db.update(raise).set({ ...rest, updatedAt: now }).where(eq(raise.id, id))
      const [updated] = await ctx.db.select().from(raise).where(eq(raise.id, id))
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Raise not found' })
      }
      return updated
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db.select().from(raise).where(eq(raise.id, input.id))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Raise not found' })
      }
      await ctx.db.delete(raise).where(eq(raise.id, input.id))
    }),
})
