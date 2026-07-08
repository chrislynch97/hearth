import { z } from 'zod'
import { asc, eq, isNull, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { member, payslipComponentType } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

const kindEnum = z.enum(['earning', 'deduction', 'employer_info'])

/** Payslips and their components belong to a person, never the joint entity. */
async function assertPerson(db: DB, householdId: string, ownerId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(scopeWhere(householdId, member.householdId, eq(member.id, ownerId)))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
  if (owner.kind !== 'person') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payslip components belong to a person, not the joint entity' })
  }
}

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
      await ctx.db.insert(payslipComponentType).values({
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
      const [inserted] = await ctx.db
        .select()
        .from(payslipComponentType)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, id)))
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert component' })
      }
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        kind: kindEnum.optional(),
        isVariable: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, isVariable, ...rest } = input
      const now = Date.now()
      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (isVariable !== undefined) setFields['isVariable'] = isVariable ? 1 : 0

      await ctx.db
        .update(payslipComponentType)
        .set(setFields)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, id)))
      const [updated] = await ctx.db
        .select()
        .from(payslipComponentType)
        .where(scopeWhere(ctx.householdId, payslipComponentType.householdId, eq(payslipComponentType.id, id)))
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Component not found' })
      }
      return updated
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
