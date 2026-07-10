import { z } from 'zod'
import { desc, eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertPerson, scopeWhere } from '../trpc/tenant'
import { payslip, payslipComponentType, payslipLine } from '../db/schema'
import type { Payslip, PayslipLine } from '../db/schema'
import { newId } from '../../shared/ids'
import { computePayslipTotals, type ComponentKind, type PayslipTotals } from '../income/payslip'
import type { DB } from '../db/client'

const lineInput = z.object({
  componentId: z.string(),
  amount: z.number().int(),
})

export interface PayslipWithLines extends Payslip {
  lines: PayslipLine[]
  totals: PayslipTotals
  hasVariablePay: boolean
}

/** Every line's component must exist and belong to the payslip's owner; no dupes. */
async function validateLines(
  db: DB,
  householdId: string,
  ownerId: string,
  lines: z.infer<typeof lineInput>[],
): Promise<void> {
  const ids = lines.map((l) => l.componentId)
  if (new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Duplicate component in payslip lines' })
  }
  if (ids.length === 0) return
  const components = await db
    .select()
    .from(payslipComponentType)
    .where(scopeWhere(householdId, payslipComponentType.householdId, inArray(payslipComponentType.id, ids)))
  if (components.length !== new Set(ids).size) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more componentId values do not exist' })
  }
  if (components.some((c) => c.ownerId !== ownerId)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A component belongs to a different member' })
  }
}

async function loadPayslip(db: DB, householdId: string, payslipId: string): Promise<PayslipWithLines> {
  const [row] = await db.select().from(payslip).where(scopeWhere(householdId, payslip.householdId, eq(payslip.id, payslipId)))
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Payslip not found' })
  }
  const lines = await db
    .select()
    .from(payslipLine)
    .where(scopeWhere(householdId, payslipLine.householdId, eq(payslipLine.payslipId, payslipId)))

  // Resolve each line's component kind / variability to compute totals.
  const componentIds = lines.map((l) => l.componentId)
  const components = componentIds.length
    ? await db
        .select()
        .from(payslipComponentType)
        .where(scopeWhere(householdId, payslipComponentType.householdId, inArray(payslipComponentType.id, componentIds)))
    : []
  const byId = new Map(components.map((c) => [c.id, c]))

  const totals = computePayslipTotals(
    lines.map((l) => {
      const component = byId.get(l.componentId)
      return {
        kind: (component?.kind ?? 'employer_info') as ComponentKind,
        amount: l.amount,
        isVariable: component?.isVariable === 1,
      }
    }),
    row.netPay,
  )
  const hasVariablePay = totals.variableEarnings !== 0

  return { ...row, lines, totals, hasVariablePay }
}

export const payslipsRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(payslip)
        .where(
          scopeWhere(
            ctx.householdId,
            payslip.householdId,
            ...(input?.ownerId ? [eq(payslip.ownerId, input.ownerId)] : []),
          ),
        )
        .orderBy(desc(payslip.payDate))

      const result: PayslipWithLines[] = []
      for (const p of rows) {
        result.push(await loadPayslip(ctx.db, ctx.householdId, p.id))
      }
      return result
    }),

  create: publicProcedure
    .input(
      z.object({
        ownerId: z.string(),
        payDate: z.string(),
        periodLabel: z.string().optional(),
        netPay: z.number().int().nullable().optional(),
        note: z.string().optional(),
        lines: z.array(lineInput).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPerson(ctx.db, ctx.householdId, input.ownerId)
      await validateLines(ctx.db, ctx.householdId, input.ownerId, input.lines)

      const now = Date.now()
      const id = newId()
      await ctx.db.insert(payslip).values({
        id,
        householdId: ctx.householdId,
        ownerId: input.ownerId,
        payDate: input.payDate,
        periodLabel: input.periodLabel ?? null,
        netPay: input.netPay ?? null,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      for (const line of input.lines) {
        await ctx.db.insert(payslipLine).values({
          id: newId(),
          householdId: ctx.householdId,
          payslipId: id,
          componentId: line.componentId,
          amount: line.amount,
          createdAt: now,
          updatedAt: now,
        })
      }
      return loadPayslip(ctx.db, ctx.householdId, id)
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        payDate: z.string().optional(),
        periodLabel: z.string().nullable().optional(),
        netPay: z.number().int().nullable().optional(),
        note: z.string().optional(),
        lines: z.array(lineInput).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, lines, ...rest } = input
      const now = Date.now()

      const [target] = await ctx.db
        .select()
        .from(payslip)
        .where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, id)))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Payslip not found' })
      }
      if (lines !== undefined) {
        await validateLines(ctx.db, ctx.householdId, target.ownerId, lines)
      }

      await ctx.db
        .update(payslip)
        .set({ ...rest, updatedAt: now })
        .where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, id)))

      if (lines !== undefined) {
        await ctx.db
          .delete(payslipLine)
          .where(scopeWhere(ctx.householdId, payslipLine.householdId, eq(payslipLine.payslipId, id)))
        for (const line of lines) {
          await ctx.db.insert(payslipLine).values({
            id: newId(),
            householdId: ctx.householdId,
            payslipId: id,
            componentId: line.componentId,
            amount: line.amount,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
      return loadPayslip(ctx.db, ctx.householdId, id)
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(payslip)
        .where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, input.id)))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Payslip not found' })
      }
      // Delete lines explicitly — FK cascade isn't enabled on the libsql connection.
      await ctx.db
        .delete(payslipLine)
        .where(scopeWhere(ctx.householdId, payslipLine.householdId, eq(payslipLine.payslipId, input.id)))
      await ctx.db.delete(payslip).where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, input.id)))
    }),
})
