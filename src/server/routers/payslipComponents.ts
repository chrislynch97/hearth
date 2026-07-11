import { z } from 'zod'
import { asc, eq, isNull, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertPerson, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { payslipComponentType } from '../db/schema'
import { newId } from '../../shared/ids'

const kindEnum = z.enum(['earning', 'deduction', 'employer_info'])

export const payslipComponentsRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(payslipComponentType)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, isNull(payslipComponentType.archivedAt)))
        .orderBy(asc(payslipComponentType.sortOrder), asc(payslipComponentType.name))
      return input?.ownerId ? rows.filter((r) => r.ownerId === input.ownerId) : rows
    }),

  create: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        name: z.string().min(1),
        kind: kindEnum,
        isVariable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPerson(ctx.db, ctx.householdId, input.ownerId)
      const now = Date.now()

      const [result] = await ctx.db
        .select({ maxOrder: max(payslipComponentType.sortOrder) })
        .from(payslipComponentType)
        .where(
          scopeWhere(
            ctx.householdId,
            payslipComponentType.householdId,
            eq(payslipComponentType.ownerId, input.ownerId),
          ),
        )
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      const [inserted] = await ctx.db
        .insert(payslipComponentType)
        .values({
          id,
          householdId: ctx.householdId,
          ownerId: input.ownerId,
          name: input.name,
          kind: input.kind,
          isVariable: input.isVariable ? 1 : 0,
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
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().min(1).optional(),
        kind: kindEnum.optional(),
        isVariable: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, isVariable, ...rest } = input
      const now = Date.now()
      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (isVariable !== undefined) setFields['isVariable'] = isVariable ? 1 : 0

      const [updated] = await ctx.db
        .update(payslipComponentType)
        .set(setFields)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, id), versionGuard(payslipComponentType.updatedAt, expectedUpdatedAt)))
        .returning()
      if (updated) return updated

      const [current] = await ctx.db
        .select({ id: payslipComponentType.id })
        .from(payslipComponentType)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, id)))
      throwStaleWrite('Component', current != null)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(payslipComponentType)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, input.id)))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Component not found' })
      }
      const now = Date.now()
      await ctx.db
        .update(payslipComponentType)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, input.id)))
    }),
})
