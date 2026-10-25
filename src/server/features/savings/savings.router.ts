import { z } from 'zod'
import { and, asc, eq, isNull, max, ne, notInArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { assertMember, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { expense, pot, savingsBalance, savingsGoal, savingsItem, setAside } from '../../db/schema'
import type { Pot, SavingsBalance, SavingsGoal, SavingsItem } from '../../db/schema'
import type { DB, Tx } from '../../db/client'
import { newId } from '@shared/ids'
import { todayIso } from '@shared/dates'
import { monthlySetAsideFor, raisedTarget, unpaidTotal, type GoalTarget } from '@shared/savings'
import { interestRateInput } from '../budget/pots.router'
import { insertContributionLines } from '../budget/setAside.router'
import { contributionLines, loadGoalPlans, loadPeriod, newShortId } from './savings'

const MONEY = z.number().int().nonnegative()
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

type AuditCtx = Parameters<typeof recordAudit>[0] & { householdId: string }

function assertTargetPair(target: GoalTarget): void {
  if ((target.targetAmount === null) !== (target.targetDate === null)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A goal has both a target and a date, or neither.' })
  }
}

async function getGoal(db: DB | Tx, householdId: string, id: string): Promise<SavingsGoal> {
  const [row] = await db.select().from(savingsGoal).where(scopeWhere(householdId, savingsGoal.householdId, eq(savingsGoal.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Savings goal not found' })
  return row
}

async function getItem(db: DB | Tx, householdId: string, id: string): Promise<SavingsItem> {
  const [row] = await db.select().from(savingsItem).where(scopeWhere(householdId, savingsItem.householdId, eq(savingsItem.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' })
  return row
}

async function getBalance(db: DB, householdId: string, id: string): Promise<SavingsBalance> {
  const [row] = await db
    .select()
    .from(savingsBalance)
    .where(scopeWhere(householdId, savingsBalance.householdId, eq(savingsBalance.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' })
  return row
}

/** Pots a new goal can sit on: live, without a goal already, and paying no
 *  bills — a goal's pot has to hold only the goal's money. */
async function eligiblePots(db: DB | Tx, householdId: string): Promise<Pot[]> {
  const taken = db.select({ id: savingsGoal.potId }).from(savingsGoal).where(eq(savingsGoal.householdId, householdId))
  const billed = db
    .select({ id: expense.potId })
    .from(expense)
    .where(and(eq(expense.householdId, householdId), eq(expense.active, 1), isNull(expense.archivedAt)))
  const rows = await db
    .select()
    .from(pot)
    .where(scopeWhere(householdId, pot.householdId, isNull(pot.archivedAt), notInArray(pot.id, taken)))
    .orderBy(asc(pot.sortOrder), asc(pot.name))
  const billedIds = new Set((await billed).map((r) => r.id))
  return rows.filter((p) => !billedIds.has(p.id))
}

/** Set a pot's rate, leaving the pot and its version alone when it already has it. */
async function setPotRate(tx: Tx, ctx: AuditCtx, potId: string, interestRateBp: number | null): Promise<void> {
  const [before] = await tx.select().from(pot).where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, potId)))
  if (!before || before.interestRateBp === interestRateBp) return
  const [after] = await tx
    .update(pot)
    .set({ interestRateBp, updatedAt: new Date() })
    .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, potId)))
    .returning()
  recordAudit(ctx, { entityType: 'pot', entityId: potId, action: 'update', before, after })
}

/** Raise the goal's target to its unpaid items once `item` takes them past it,
 *  as a person's gift budget raises the occasion's. The new target, or null. */
async function coverItems(tx: Tx, ctx: AuditCtx, item: SavingsItem): Promise<number | null> {
  const before = await getGoal(tx, ctx.householdId, item.goalId)
  if (before.targetAmount === null) return null
  const others = await tx
    .select({ amount: savingsItem.amount, paidOn: savingsItem.paidOn })
    .from(savingsItem)
    .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.goalId, item.goalId), ne(savingsItem.id, item.id)))
  const raised = raisedTarget(before.targetAmount, unpaidTotal(others), item.paidOn ? 0 : item.amount)
  if (raised === null) return null
  const [after] = await tx
    .update(savingsGoal)
    .set({ targetAmount: raised, updatedAt: new Date() })
    .where(scopeWhere(ctx.householdId, savingsGoal.householdId, eq(savingsGoal.id, item.goalId)))
    .returning()
  recordAudit(ctx, { entityType: 'savingsGoal', entityId: item.goalId, action: 'update', before, after })
  return raised
}

const NEEDS_A_DATE = 'Give it a date: this goal saves for each item by its own.'

export const savingsRouter = router({
  /** Every goal, archived included, soonest first, each with its plan. */
  goals: publicProcedure.query(async ({ ctx }) => (await loadGoalPlans(ctx.db, ctx.householdId, todayIso())).plans),

  /** One goal with its items, balances, contribution, cycle and plan. The
   *  period and today travel with it so the client can redraw a what-if. */
  goal: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const today = todayIso()
    const { period, plans } = await loadGoalPlans(ctx.db, ctx.householdId, today, { goalIds: [input.id] })
    const [loaded] = plans
    if (!loaded) throw new TRPCError({ code: 'NOT_FOUND', message: 'Savings goal not found' })
    return { ...loaded, period, today }
  }),

  eligiblePots: publicProcedure.query(({ ctx }) => eligiblePots(ctx.db, ctx.householdId)),

  createGoal: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        /** Both null for an item-by-item goal. */
        targetAmount: MONEY.nullable(),
        targetDate: DATE.nullable(),
        /** An existing pot, or a new one made with the goal. */
        pot: z.union([z.object({ id: z.string() }), z.object({ name: z.string().trim().min(1), ownerId: z.string() })]),
        /** The pot's rate; left as it is when absent. */
        interestRateBp: interestRateInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTargetPair(input)
      if ('ownerId' in input.pot) await assertMember(ctx.db, ctx.householdId, input.pot.ownerId)
      const now = new Date()
      const id = newId()
      await ctx.db.transaction(async (tx) => {
        let potId: string
        if ('id' in input.pot) {
          const allowed = await eligiblePots(tx, ctx.householdId)
          if (!allowed.some((p) => p.id === (input.pot as { id: string }).id)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'That pot already has a goal or pays bills' })
          }
          potId = input.pot.id
          if (input.interestRateBp !== undefined) await setPotRate(tx, ctx, potId, input.interestRateBp)
        } else {
          const [result] = await tx.select({ maxOrder: max(pot.sortOrder) }).from(pot).where(scopeWhere(ctx.householdId, pot.householdId))
          const [created] = await tx
            .insert(pot)
            .values({
              id: newId(),
              householdId: ctx.householdId,
              name: input.pot.name,
              categoryId: null,
              ownerId: input.pot.ownerId,
              sortOrder: (result?.maxOrder ?? 0) + 1,
              note: null,
              interestRateBp: input.interestRateBp ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
          recordAudit(ctx, { entityType: 'pot', entityId: created!.id, action: 'create', after: created })
          potId = created!.id
        }
        const taken = await tx
          .select({ shortId: savingsGoal.shortId })
          .from(savingsGoal)
          .where(eq(savingsGoal.householdId, ctx.householdId))
        await tx.insert(savingsGoal).values({
          id,
          householdId: ctx.householdId,
          potId,
          shortId: newShortId(new Set(taken.map((t) => t.shortId))),
          name: input.name,
          targetAmount: input.targetAmount,
          targetDate: input.targetDate,
          createdAt: now,
          updatedAt: now,
        })
      })
      const created = await getGoal(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'savingsGoal', entityId: id, action: 'create', after: created })
      return created
    }),

  updateGoal: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().trim().min(1).optional(),
        /** Both null turns the goal item by item. */
        targetAmount: MONEY.nullable().optional(),
        targetDate: DATE.nullable().optional(),
        /** The goal's pot's rate; left as it is when absent. */
        interestRateBp: interestRateInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, interestRateBp, ...rest } = input
      const before = await getGoal(ctx.db, ctx.householdId, id)
      assertTargetPair({ ...before, ...rest })
      const now = new Date()
      const written = await ctx.db.transaction(async (tx) => {
        const [written] = await tx
          .update(savingsGoal)
          .set({ ...rest, updatedAt: now })
          .where(scopeWhere(ctx.householdId, savingsGoal.householdId, eq(savingsGoal.id, id), versionGuard(savingsGoal.updatedAt, expectedUpdatedAt)))
          .returning()
        if (!written) throwStaleWrite('Savings goal', true)
        // Going item by item drops the goal date, so an item due on it keeps that date as its own.
        if (before.targetDate !== null && written.targetDate === null) {
          const undated = await tx
            .select()
            .from(savingsItem)
            .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.goalId, id), isNull(savingsItem.dueDate)))
          for (const item of undated) {
            const [after] = await tx
              .update(savingsItem)
              .set({ dueDate: before.targetDate, updatedAt: now })
              .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.id, item.id)))
              .returning()
            recordAudit(ctx, { entityType: 'savingsItem', entityId: item.id, action: 'update', before: item, after })
          }
        }
        if (interestRateBp !== undefined) await setPotRate(tx, ctx, before.potId, interestRateBp)
        return written
      })
      recordAudit(ctx, { entityType: 'savingsGoal', entityId: id, action: 'update', before, after: written })
      return written
    }),

  /** Archive (or bring back) a goal. Its pot and contributions are left alone. */
  setArchived: publicProcedure
    .input(z.object({ id: z.string(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const before = await getGoal(ctx.db, ctx.householdId, input.id)
      const now = new Date()
      const [after] = await ctx.db
        .update(savingsGoal)
        .set({ archivedAt: input.archived ? now : null, updatedAt: now })
        .where(scopeWhere(ctx.householdId, savingsGoal.householdId, eq(savingsGoal.id, input.id)))
        .returning()
      recordAudit(ctx, { entityType: 'savingsGoal', entityId: input.id, action: input.archived ? 'archive' : 'update', before, after })
      return after!
    }),

  /** Hard-delete a goal with its items and balances (cascade). The pot stays. */
  removeGoal: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getGoal(ctx.db, ctx.householdId, input.id)
    await ctx.db.delete(savingsGoal).where(scopeWhere(ctx.householdId, savingsGoal.householdId, eq(savingsGoal.id, input.id)))
    recordAudit(ctx, { entityType: 'savingsGoal', entityId: input.id, action: 'delete', before: target })
  }),

  // -- Items ---------------------------------------------------------------

  createItem: publicProcedure
    .input(z.object({ goalId: z.string(), name: z.string().trim().min(1), amount: MONEY, dueDate: DATE.nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const goal = await getGoal(ctx.db, ctx.householdId, input.goalId)
      if (goal.targetDate === null && !input.dueDate) throw new TRPCError({ code: 'BAD_REQUEST', message: NEEDS_A_DATE })
      const [result] = await ctx.db
        .select({ maxOrder: max(savingsItem.sortOrder) })
        .from(savingsItem)
        .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.goalId, input.goalId)))
      const now = new Date()
      const id = newId()
      const { created, raised } = await ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(savingsItem)
          .values({
            id,
            householdId: ctx.householdId,
            goalId: input.goalId,
            name: input.name,
            amount: input.amount,
            dueDate: input.dueDate ?? null,
            paidOn: null,
            sortOrder: (result?.maxOrder ?? 0) + 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        return { created: created!, raised: await coverItems(tx, ctx, created!) }
      })
      recordAudit(ctx, { entityType: 'savingsItem', entityId: id, action: 'create', after: created })
      return { ...created, raisedTarget: raised }
    }),

  updateItem: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().trim().min(1).optional(),
        amount: MONEY.optional(),
        dueDate: DATE.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...rest } = input
      const before = await getItem(ctx.db, ctx.householdId, id)
      const goal = await getGoal(ctx.db, ctx.householdId, before.goalId)
      if (goal.targetDate === null && rest.dueDate === null) throw new TRPCError({ code: 'BAD_REQUEST', message: NEEDS_A_DATE })
      const { written, raised } = await ctx.db.transaction(async (tx) => {
        const [written] = await tx
          .update(savingsItem)
          .set({ ...rest, updatedAt: new Date() })
          .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.id, id), versionGuard(savingsItem.updatedAt, expectedUpdatedAt)))
          .returning()
        if (!written) throwStaleWrite('Item', true)
        return { written, raised: await coverItems(tx, ctx, written) }
      })
      recordAudit(ctx, { entityType: 'savingsItem', entityId: id, action: 'update', before, after: written })
      return { ...written, raisedTarget: raised }
    }),

  removeItem: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getItem(ctx.db, ctx.householdId, input.id)
    await ctx.db.delete(savingsItem).where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.id, input.id)))
    recordAudit(ctx, { entityType: 'savingsItem', entityId: input.id, action: 'delete', before: target })
  }),

  /** Tick an item paid (or untick it). `reduceTarget` takes its cost off the
   *  goal's target in the same write — the household's answer to "take it off?".
   *  An item-by-item goal has no target to take it off. */
  setPaid: publicProcedure
    .input(z.object({ id: z.string(), paidOn: DATE.nullable(), reduceTarget: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const before = await getItem(ctx.db, ctx.householdId, input.id)
      const reduce = input.reduceTarget && input.paidOn !== null
      const now = new Date()
      return ctx.db.transaction(async (tx) => {
        const [item] = await tx
          .update(savingsItem)
          .set({ paidOn: input.paidOn, updatedAt: now })
          .where(scopeWhere(ctx.householdId, savingsItem.householdId, eq(savingsItem.id, input.id)))
          .returning()
        recordAudit(ctx, { entityType: 'savingsItem', entityId: input.id, action: 'update', before, after: item })
        if (!reduce) return { item: item!, targetAmount: null }

        const goalBefore = await getGoal(tx, ctx.householdId, before.goalId)
        if (goalBefore.targetAmount === null) return { item: item!, targetAmount: null }
        const [goal] = await tx
          .update(savingsGoal)
          .set({ targetAmount: Math.max(0, goalBefore.targetAmount - before.amount), updatedAt: now })
          .where(scopeWhere(ctx.householdId, savingsGoal.householdId, eq(savingsGoal.id, before.goalId)))
          .returning()
        recordAudit(ctx, { entityType: 'savingsGoal', entityId: before.goalId, action: 'update', before: goalBefore, after: goal })
        return { item: item!, targetAmount: goal!.targetAmount }
      })
    }),

  // -- Balances ------------------------------------------------------------

  /** Record what was in the pot on a day; a second entry for the same day replaces it. */
  recordBalance: publicProcedure
    .input(z.object({ goalId: z.string(), asOfDate: DATE, amount: MONEY, note: z.string().trim().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      await getGoal(ctx.db, ctx.householdId, input.goalId)
      const now = new Date()
      const note = input.note || null
      const [existing] = await ctx.db
        .select()
        .from(savingsBalance)
        .where(scopeWhere(ctx.householdId, savingsBalance.householdId, eq(savingsBalance.goalId, input.goalId), eq(savingsBalance.asOfDate, input.asOfDate)))
      if (existing) {
        const [after] = await ctx.db
          .update(savingsBalance)
          .set({ amount: input.amount, note, updatedAt: now })
          .where(scopeWhere(ctx.householdId, savingsBalance.householdId, eq(savingsBalance.id, existing.id)))
          .returning()
        recordAudit(ctx, { entityType: 'savingsBalance', entityId: existing.id, action: 'update', before: existing, after })
        return after!
      }
      const id = newId()
      const [created] = await ctx.db
        .insert(savingsBalance)
        .values({ id, householdId: ctx.householdId, goalId: input.goalId, asOfDate: input.asOfDate, amount: input.amount, note, createdAt: now, updatedAt: now })
        .returning()
      recordAudit(ctx, { entityType: 'savingsBalance', entityId: id, action: 'create', after: created })
      return created!
    }),

  /** Correct a recorded balance — its amount, note, or the day it was read. */
  updateBalance: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        asOfDate: DATE.optional(),
        amount: MONEY.optional(),
        note: z.string().trim().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, note, ...rest } = input
      const before = await getBalance(ctx.db, ctx.householdId, id)
      if (rest.asOfDate && rest.asOfDate !== before.asOfDate) {
        const [clash] = await ctx.db
          .select({ id: savingsBalance.id })
          .from(savingsBalance)
          .where(scopeWhere(ctx.householdId, savingsBalance.householdId, eq(savingsBalance.goalId, before.goalId), eq(savingsBalance.asOfDate, rest.asOfDate)))
        if (clash) throw new TRPCError({ code: 'BAD_REQUEST', message: 'There is already a balance on that day. Edit that one instead.' })
      }
      const [written] = await ctx.db
        .update(savingsBalance)
        .set({ ...rest, ...(note !== undefined ? { note: note || null } : {}), updatedAt: new Date() })
        .where(scopeWhere(ctx.householdId, savingsBalance.householdId, eq(savingsBalance.id, id), versionGuard(savingsBalance.updatedAt, expectedUpdatedAt)))
        .returning()
      if (!written) throwStaleWrite('Balance', true)
      recordAudit(ctx, { entityType: 'savingsBalance', entityId: id, action: 'update', before, after: written })
      return written
    }),

  removeBalance: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getBalance(ctx.db, ctx.householdId, input.id)
    await ctx.db.delete(savingsBalance).where(scopeWhere(ctx.householdId, savingsBalance.householdId, eq(savingsBalance.id, input.id)))
    recordAudit(ctx, { entityType: 'savingsBalance', entityId: input.id, action: 'delete', before: target })
  }),

  // -- Contribution --------------------------------------------------------

  /** Set the goal's pot to put in `perPeriod` each budget period, through the
   *  pot's own set-aside so Funding sees it. Only a pot with at most one
   *  contribution line can be rewritten; several lines are the household's to split. */
  applyContribution: publicProcedure
    .input(z.object({ goalId: z.string(), perPeriod: MONEY }))
    .mutation(async ({ ctx, input }) => {
      const goal = await getGoal(ctx.db, ctx.householdId, input.goalId)
      const period = await loadPeriod(ctx.db, ctx.householdId)
      const monthly = monthlySetAsideFor(input.perPeriod, period)
      const now = new Date()
      await ctx.db.transaction(async (tx) => {
        const lines = await contributionLines(tx, ctx.householdId, goal.potId)
        if (lines.length > 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This pot has several contribution lines. Change them on the Plan page.' })
        }
        const [line] = lines
        if (line) {
          const [after] = await tx
            .update(setAside)
            .set({ amount: monthly, recurrence: 'monthly', updatedAt: now })
            .where(scopeWhere(ctx.householdId, setAside.householdId, eq(setAside.id, line.id)))
            .returning()
          recordAudit(ctx, { entityType: 'setAside', entityId: line.id, action: 'update', before: line, after })
          return
        }
        const [p] = await tx.select().from(pot).where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, goal.potId)))
        await insertContributionLines(tx, ctx.householdId, p!, [{ label: null, amount: monthly, recurrence: 'monthly' }], now)
        const [created] = await contributionLines(tx, ctx.householdId, goal.potId)
        if (created) recordAudit(ctx, { entityType: 'setAside', entityId: created.id, action: 'create', after: created })
      })
      return { monthly }
    }),
})
