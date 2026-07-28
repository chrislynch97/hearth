import { eq, isNull } from 'drizzle-orm'
import { scopeWhere } from '../../trpc/tenant'
import { recordAudit, type AuditCtx } from '../../trpc/audit'
import { expense, standingOrderAck } from '../../db/schema'
import { newId } from '../../../shared/ids'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../../shared/recurrence'

/** A bill, reduced to what the standing-order requirement cares about. Only
 *  active `pot_manual` bills contribute — `pot_auto`/`main` have no standing order. */
export interface StandingOrderBillInput {
  expenseId: string
  name: string
  funding: 'pot_manual' | 'pot_auto' | 'main'
  potId: string | null
  amount: number
  recurrence: Recurrence
  active: boolean
}

/** One recorded price for a bill (from `bill_price`, issue #68), used to attribute
 *  a pot's delta to the bills that moved it. `createdAt` is when the change was
 *  recorded — the axis we compare against the acknowledgement time. */
export interface StandingOrderPriceRow {
  expenseId: string
  amount: number
  createdAt: Date
}

/** The last acknowledged requirement for a pot: `amount` is monthly minor units,
 *  `updatedAt` is when it was acknowledged. */
export interface StandingOrderAckInput {
  potId: string
  amount: number
  updatedAt: Date
}

export interface StandingOrderContributor {
  expenseId: string
  name: string
  /** Monthly minor-units change since the acknowledgement (signed). */
  deltaMonthly: number
}

export interface StandingOrderAlert {
  potId: string
  potName: string
  /** Last-acknowledged monthly requirement. */
  wasMonthly: number
  /** Current derived monthly requirement. */
  nowMonthly: number
  /** now − was (signed). */
  deltaMonthly: number
  contributors: StandingOrderContributor[]
}

/** The monthly minor-units requirement a pot's standing order must cover: the sum
 *  of the active `pot_manual` bills that drain it. Rounded once, like the funding
 *  plan does per pot. */
export function potManualMonthly(bills: StandingOrderBillInput[], potId: string): number {
  const sum = bills
    .filter((b) => b.active && b.funding === 'pot_manual' && b.potId === potId)
    .reduce((acc, b) => acc + normaliseToMonthly(b.amount, b.recurrence), 0)
  return roundMinor(sum)
}

/** The pot's current monthly `pot_manual` requirement — the standing order it must
 *  cover (issue #69). Read straight from the DB so the caller gets the live figure
 *  before or after applying an edit. */
export async function potManualMonthlyFromDb(ctx: AuditCtx, potId: string): Promise<number> {
  const rows = await ctx.db
    .select({ amount: expense.amount, recurrence: expense.recurrence })
    .from(expense)
    .where(
      scopeWhere(
        ctx.householdId,
        expense.householdId,
        isNull(expense.archivedAt),
        eq(expense.active, 1),
        eq(expense.funding, 'pot_manual'),
        eq(expense.potId, potId),
      ),
    )
  const sum = rows.reduce((acc, r) => acc + normaliseToMonthly(r.amount ?? 0, r.recurrence as Recurrence), 0)
  return roundMinor(sum)
}

/** Capture a standing-order baseline the first time a pot's `pot_manual` bill price
 *  changes (issue #69), so the alert has a "was" to compare the new requirement
 *  against. Mirrors the price-history seed: record the pre-change requirement once,
 *  then leave it — later changes in the same sitting compare against this baseline
 *  (one alert per pot, not one per bill). No-op if the pot already has an ack. Pass
 *  the requirement computed *before* the edit was applied. */
export async function seedStandingOrderBaseline(
  ctx: AuditCtx,
  potId: string,
  priorMonthly: number,
  at: Date,
): Promise<void> {
  const [existing] = await ctx.db
    .select({ id: standingOrderAck.id })
    .from(standingOrderAck)
    .where(scopeWhere(ctx.householdId, standingOrderAck.householdId, eq(standingOrderAck.potId, potId)))
  if (existing) return

  const [row] = await ctx.db
    .insert(standingOrderAck)
    .values({ id: newId(), householdId: ctx.householdId, potId, amount: priorMonthly, createdAt: at, updatedAt: at })
    .returning()
  if (row) recordAudit(ctx, { entityType: 'standing_order_ack', entityId: row.id, action: 'create', after: row })
}

/** The bill's amount as it stood at the acknowledgement time. `history` is this
 *  bill's price rows, oldest-first. The last row recorded at-or-before the ack is
 *  the acknowledged price; if every recorded change post-dates the ack (the seed
 *  and change land together on a first change), the earliest recorded (seed) row
 *  is the pre-ack price; with no history the amount never changed. */
function amountAsOfAck(history: StandingOrderPriceRow[], ackAt: Date, currentAmount: number): number {
  const first = history[0]
  if (!first) return currentAmount
  const ackMs = ackAt.getTime()
  let result = first.amount // earliest recorded price, if none is at-or-before the ack
  for (const row of history) {
    if (row.createdAt.getTime() <= ackMs) result = row.amount
  }
  return result
}

/** Which pots have a standing order gone stale since it was last acknowledged, and
 *  the bill changes that moved each. A pot is stale when its current `pot_manual`
 *  requirement differs from the acknowledged one; only pots with an acknowledgement
 *  are considered (nothing to compare against otherwise). Batching falls out for
 *  free: several bills changing against one baseline yield one alert per pot. */
export function computeStandingOrderAlerts(input: {
  pots: Array<{ id: string; name: string }>
  bills: StandingOrderBillInput[]
  acks: StandingOrderAckInput[]
  priceHistory: StandingOrderPriceRow[]
}): StandingOrderAlert[] {
  const { pots, bills, acks, priceHistory } = input
  const potById = new Map(pots.map((p) => [p.id, p]))

  const historyByExpense = new Map<string, StandingOrderPriceRow[]>()
  for (const row of priceHistory) {
    const list = historyByExpense.get(row.expenseId) ?? []
    list.push(row)
    historyByExpense.set(row.expenseId, list)
  }
  for (const list of historyByExpense.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  const alerts: StandingOrderAlert[] = []
  for (const ack of acks) {
    const pot = potById.get(ack.potId)
    if (!pot) continue // pot archived/removed — no standing order to nag about

    const nowMonthly = potManualMonthly(bills, ack.potId)
    if (nowMonthly === ack.amount) continue

    const contributors: StandingOrderContributor[] = []
    for (const bill of bills) {
      if (!bill.active || bill.funding !== 'pot_manual' || bill.potId !== ack.potId) continue
      const history = historyByExpense.get(bill.expenseId) ?? []
      const wasAmount = amountAsOfAck(history, ack.updatedAt, bill.amount)
      const deltaMonthly = roundMinor(
        normaliseToMonthly(bill.amount, bill.recurrence) - normaliseToMonthly(wasAmount, bill.recurrence),
      )
      if (deltaMonthly !== 0) contributors.push({ expenseId: bill.expenseId, name: bill.name, deltaMonthly })
    }
    contributors.sort((a, b) => Math.abs(b.deltaMonthly) - Math.abs(a.deltaMonthly) || a.name.localeCompare(b.name))

    alerts.push({
      potId: ack.potId,
      potName: pot.name,
      wasMonthly: ack.amount,
      nowMonthly,
      deltaMonthly: nowMonthly - ack.amount,
      contributors,
    })
  }

  return alerts.sort((a, b) => a.potName.localeCompare(b.potName))
}
