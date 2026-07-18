import { z } from 'zod'
import { eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { expense, pot, billPrice, standingOrderAck } from '../db/schema'
import type { DB } from '../db/client'
import { newId } from '../../shared/ids'
import type { Recurrence } from '../../shared/recurrence'
import {
  computeStandingOrderAlerts,
  potManualMonthly,
  type StandingOrderBillInput,
} from '../plan/standingOrders'

/** Active bills reduced to the standing-order shape. Shared by the alert read and
 *  the acknowledge write so both derive the requirement identically. */
async function loadStandingOrderBills(db: DB, householdId: string): Promise<StandingOrderBillInput[]> {
  const rows = await db
    .select()
    .from(expense)
    .where(scopeWhere(householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1)))
  return rows.map((e) => ({
    expenseId: e.id,
    name: e.name,
    funding: (e.funding ?? 'pot_manual') as 'pot_manual' | 'pot_auto' | 'main',
    potId: e.potId,
    amount: e.amount ?? 0,
    recurrence: e.recurrence as Recurrence,
    active: e.active === 1,
  }))
}

export const standingOrdersRouter = router({
  // Pots whose standing order has gone stale since it was last acknowledged
  // (issue #69), each with the bill changes that moved it. Drives the Funding-page
  // alert and the spend-prompt confirmation line.
  alerts: publicProcedure.query(async ({ ctx }) => {
    const pots = await ctx.db
      .select({ id: pot.id, name: pot.name })
      .from(pot)
      .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))

    const bills = await loadStandingOrderBills(ctx.db, ctx.householdId)

    const acks = await ctx.db
      .select({ potId: standingOrderAck.potId, amount: standingOrderAck.amount, updatedAt: standingOrderAck.updatedAt })
      .from(standingOrderAck)
      .where(scopeWhere(ctx.householdId, standingOrderAck.householdId))

    const priceHistory = await ctx.db
      .select({ expenseId: billPrice.expenseId, amount: billPrice.amount, createdAt: billPrice.createdAt })
      .from(billPrice)
      .where(scopeWhere(ctx.householdId, billPrice.householdId))

    return computeStandingOrderAlerts({ pots, bills, acks, priceHistory })
  }),

  // "Done, I've updated the bank" — record the pot's current derived requirement as
  // acknowledged, clearing its alert until the next bill change moves it.
  acknowledge: publicProcedure
    .input(z.object({ potId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db
        .select({ id: pot.id })
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, input.potId)))
      if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pot not found' })

      const bills = await loadStandingOrderBills(ctx.db, ctx.householdId)
      const amount = potManualMonthly(bills, input.potId)
      const now = new Date()

      const [existing] = await ctx.db
        .select()
        .from(standingOrderAck)
        .where(scopeWhere(ctx.householdId, standingOrderAck.householdId, eq(standingOrderAck.potId, input.potId)))

      if (existing) {
        const [after] = await ctx.db
          .update(standingOrderAck)
          .set({ amount, updatedAt: now })
          .where(scopeWhere(ctx.householdId, standingOrderAck.householdId, eq(standingOrderAck.id, existing.id)))
          .returning()
        recordAudit(ctx, { entityType: 'standing_order_ack', entityId: existing.id, action: 'update', before: existing, after })
        return after
      }

      const [inserted] = await ctx.db
        .insert(standingOrderAck)
        .values({ id: newId(), householdId: ctx.householdId, potId: input.potId, amount, createdAt: now, updatedAt: now })
        .returning()
      if (inserted) recordAudit(ctx, { entityType: 'standing_order_ack', entityId: inserted.id, action: 'create', after: inserted })
      return inserted
    }),
})
