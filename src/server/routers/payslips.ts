import { z } from 'zod'
import { desc, eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertPerson, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { recordAudit } from '../trpc/audit'
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

type PayslipRow = typeof payslip.$inferSelect
type ComponentRow = typeof payslipComponentType.$inferSelect

/** Assemble one payslip's lines + totals into the API shape. Pure: callers pass
 *  the already-fetched rows so both the single-row and list paths reuse it. */
function assemblePayslip(row: PayslipRow, lines: PayslipLine[], componentById: Map<string, ComponentRow>): PayslipWithLines {
  const totals = computePayslipTotals(
    lines.map((l) => {
      const component = componentById.get(l.componentId)
      return {
        kind: (component?.kind ?? 'employer_info') as ComponentKind,
        amount: l.amount,
        isVariable: component?.isVariable === 1,
      }
    }),
    row.netPay,
  )
  return { ...row, lines, totals, hasVariablePay: totals.variableEarnings !== 0 }
}

/** An audit snapshot of a payslip: its row fields + lines, dropping the computed
 *  totals/hasVariablePay so a diff only ever reflects real stored changes. */
function auditSnapshot(p: PayslipWithLines): Record<string, unknown> {
  const { totals: _totals, hasVariablePay: _hasVariablePay, ...snap } = p
  return snap
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
  return assemblePayslip(row, lines, new Map(components.map((c) => [c.id, c])))
}

export const payslipsRouter = router({
  list: publicProcedure
    .input(z.object({ ownerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Three household-scoped queries + in-memory assembly, instead of the old
      // per-row loadPayslip() (3 queries each = an N+1 over the components table).
      const [rows, lines, components] = await Promise.all([
        ctx.db
          .select()
          .from(payslip)
          .where(
            scopeWhere(
              ctx.householdId,
              payslip.householdId,
              ...(input?.ownerId ? [eq(payslip.ownerId, input.ownerId)] : []),
            ),
          )
          .orderBy(desc(payslip.payDate)),
        ctx.db.select().from(payslipLine).where(scopeWhere(ctx.householdId, payslipLine.householdId)),
        ctx.db
          .select()
          .from(payslipComponentType)
          .where(scopeWhere(ctx.householdId, payslipComponentType.householdId)),
      ])

      const componentById = new Map(components.map((c) => [c.id, c]))
      const linesByPayslip = new Map<string, PayslipLine[]>()
      for (const l of lines) {
        const arr = linesByPayslip.get(l.payslipId) ?? []
        arr.push(l)
        linesByPayslip.set(l.payslipId, arr)
      }

      return rows.map((p) => assemblePayslip(p, linesByPayslip.get(p.id) ?? [], componentById))
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

      const now = new Date()
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
      const created = await loadPayslip(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'payslip', entityId: id, action: 'create', after: auditSnapshot(created) })
      return created
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        payDate: z.string().optional(),
        periodLabel: z.string().nullable().optional(),
        netPay: z.number().int().nullable().optional(),
        note: z.string().optional(),
        lines: z.array(lineInput).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, lines, ...rest } = input
      const now = new Date()

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
      // Snapshot row + lines before we touch either, so the diff reflects both.
      const before = auditSnapshot(await loadPayslip(ctx.db, ctx.householdId, id))

      // Guard the payslip row first: on a stale write, bail before we touch its
      // lines, so a losing concurrent edit never destroys the winner's lines.
      const [written] = await ctx.db
        .update(payslip)
        .set({ ...rest, updatedAt: now })
        .where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, id), versionGuard(payslip.updatedAt, expectedUpdatedAt)))
        .returning({ id: payslip.id })
      if (!written) throwStaleWrite('Payslip', true)

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
      const after = await loadPayslip(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'payslip', entityId: id, action: 'update', before, after: auditSnapshot(after) })
      return after
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
      const before = auditSnapshot(await loadPayslip(ctx.db, ctx.householdId, input.id))
      // Delete lines explicitly — FK cascade isn't enabled on the libsql connection.
      await ctx.db
        .delete(payslipLine)
        .where(scopeWhere(ctx.householdId, payslipLine.householdId, eq(payslipLine.payslipId, input.id)))
      await ctx.db.delete(payslip).where(scopeWhere(ctx.householdId, payslip.householdId, eq(payslip.id, input.id)))
      recordAudit(ctx, { entityType: 'payslip', entityId: input.id, action: 'delete', before })
    }),
})
