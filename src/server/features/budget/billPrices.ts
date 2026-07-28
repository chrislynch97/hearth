import { eq } from 'drizzle-orm'
import { scopeWhere } from '../../trpc/tenant'
import { recordAudit, type AuditCtx } from '../../trpc/audit'
import { billPrice } from '../../db/schema'
import type { Expense } from '../../db/schema'
import { newId } from '../../../shared/ids'

/** Record a bill's price change as effective-dated history (issue #68). Seeds a
 *  starting row at the old price the first time a bill gets history, so a change
 *  never looks like it came from nowhere. Call only when the amount changed. */
export async function recordBillPriceChange(
  ctx: AuditCtx,
  before: Expense,
  newAmount: number,
  source: 'manual' | 'spend_prompt',
  effectiveDate: string,
): Promise<void> {
  const now = new Date()
  const existing = await ctx.db
    .select({ id: billPrice.id })
    .from(billPrice)
    .where(scopeWhere(ctx.householdId, billPrice.householdId, eq(billPrice.expenseId, before.id)))
    .limit(1)

  const rows: (typeof billPrice.$inferInsert)[] = []
  if (existing.length === 0 && before.amount != null) {
    // Anchor the seed to the bill's creation, but never after the change itself
    // (a backdated spend can predate the bill's row) so it always reads first.
    const created = before.createdAt.toISOString().slice(0, 10)
    rows.push({
      id: newId(),
      householdId: ctx.householdId,
      expenseId: before.id,
      effectiveDate: created < effectiveDate ? created : effectiveDate,
      amount: before.amount,
      note: 'Starting price',
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    })
  }
  rows.push({
    id: newId(),
    householdId: ctx.householdId,
    expenseId: before.id,
    effectiveDate,
    amount: newAmount,
    note: null,
    source,
    // 1ms after any seed so a same-day seed still reads before its change.
    createdAt: new Date(now.getTime() + 1),
    updatedAt: now,
  })

  const inserted = await ctx.db.insert(billPrice).values(rows).returning()
  for (const row of inserted) {
    recordAudit(ctx, { entityType: 'bill_price', entityId: row.id, action: 'create', after: row })
  }
}
