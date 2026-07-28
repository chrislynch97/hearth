import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { assertPerson, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { raise } from '../../db/schema'
import type { Raise } from '../../db/schema'
import { newId } from '../../../shared/ids'
import { percentIncrease } from './raises'

export interface RaiseWithIncrease extends Raise {
  percentIncrease: number | null
}

export const raisesRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(raise)
        .where(scopeWhere(ctx.householdId, raise.householdId))
        .orderBy(asc(raise.effectiveDate))
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
      await assertPerson(ctx.db, ctx.householdId, input.ownerId)
      const now = new Date()
      const id = newId()
      const [inserted] = await ctx.db
        .insert(raise)
        .values({
          id,
          householdId: ctx.householdId,
          ownerId: input.ownerId,
          effectiveDate: input.effectiveDate,
          newSalary: input.newSalary,
          bonus: input.bonus ?? null,
          newPosition: input.newPosition ?? null,
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      recordAudit(ctx, { entityType: 'raise', entityId: id, action: 'create', after: inserted })
      return inserted!
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        effectiveDate: z.string().optional(),
        newSalary: z.number().int().optional(),
        bonus: z.number().int().nullable().optional(),
        newPosition: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...rest } = input
      const now = new Date()
      const [before] = await ctx.db
        .select()
        .from(raise)
        .where(scopeWhere(ctx.householdId, raise.householdId, eq(raise.id, id)))
      const [updated] = await ctx.db
        .update(raise)
        .set({ ...rest, updatedAt: now })
        .where(scopeWhere(ctx.householdId, raise.householdId, eq(raise.id, id), versionGuard(raise.updatedAt, expectedUpdatedAt)))
        .returning()
      if (updated) {
        recordAudit(ctx, { entityType: 'raise', entityId: id, action: 'update', before, after: updated })
        return updated
      }

      const [current] = await ctx.db
        .select({ id: raise.id })
        .from(raise)
        .where(scopeWhere(ctx.householdId, raise.householdId, eq(raise.id, id)))
      throwStaleWrite('Raise', current != null)
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(raise)
        .where(scopeWhere(ctx.householdId, raise.householdId, eq(raise.id, input.id)))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Raise not found' })
      }
      await ctx.db.delete(raise).where(scopeWhere(ctx.householdId, raise.householdId, eq(raise.id, input.id)))
      recordAudit(ctx, { entityType: 'raise', entityId: input.id, action: 'delete', before: target })
    }),
})
