import { z } from 'zod'
import { asc, eq, inArray, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { expense, expenseShare, member, pot } from '../db/schema'
import type { Expense, ExpenseShare } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

const shareInput = z.object({
  ownerId: z.string(),
  amount: z.number().int().min(0),
  potId: z.string().nullable().optional(),
})

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'yearly'])

/** Validate that every ownerId refers to an existing member and every non-null potId refers to an existing pot. */
async function validateShares(db: DB, shares: z.infer<typeof shareInput>[]): Promise<void> {
  const ownerIds = [...new Set(shares.map((s) => s.ownerId))]
  const potIds = [...new Set(shares.map((s) => s.potId).filter((id): id is string => !!id))]

  if (ownerIds.length > 0) {
    const owners = await db.select().from(member).where(inArray(member.id, ownerIds))
    if (owners.length !== ownerIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more ownerId values do not refer to an existing member' })
    }
  }

  if (potIds.length > 0) {
    const pots = await db.select().from(pot).where(inArray(pot.id, potIds))
    if (pots.length !== potIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more potId values do not refer to an existing pot' })
    }
  }
}

async function loadExpenseWithShares(db: DB, expenseId: string): Promise<Expense & { shares: ExpenseShare[] }> {
  const [row] = await db.select().from(expense).where(eq(expense.id, expenseId))
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found' })
  }
  const shares = await db.select().from(expenseShare).where(eq(expenseShare.expenseId, expenseId))
  return { ...row, shares }
}

export const expensesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const expenses = await ctx.db
      .select()
      .from(expense)
      .where(isNull(expense.archivedAt))
      .orderBy(asc(expense.name))

    const result: Array<Expense & { shares: ExpenseShare[] }> = []
    for (const e of expenses) {
      const shares = await ctx.db.select().from(expenseShare).where(eq(expenseShare.expenseId, e.id))
      result.push({ ...e, shares })
    }
    return result
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        recurrence: recurrenceEnum,
        note: z.string().optional(),
        dueAnchor: z.string().optional(),
        dueReminderDays: z.number().int().optional(),
        shares: z.array(shareInput).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hasPositiveShare = input.shares.some((s) => s.amount > 0)
      if (!hasPositiveShare) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'At least one share must have amount > 0' })
      }

      await validateShares(ctx.db, input.shares)

      const now = Date.now()
      const id = newId()

      await ctx.db.insert(expense).values({
        id,
        name: input.name,
        recurrence: input.recurrence,
        note: input.note ?? null,
        dueAnchor: input.dueAnchor ?? null,
        dueReminderDays: input.dueReminderDays ?? null,
        createdAt: now,
        updatedAt: now,
      })

      for (const share of input.shares) {
        await ctx.db.insert(expenseShare).values({
          id: newId(),
          expenseId: id,
          ownerId: share.ownerId,
          amount: share.amount,
          potId: share.potId ?? null,
          createdAt: now,
          updatedAt: now,
        })
      }

      return loadExpenseWithShares(ctx.db, id)
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        recurrence: recurrenceEnum.optional(),
        note: z.string().optional(),
        active: z.boolean().optional(),
        dueAnchor: z.string().optional(),
        dueReminderDays: z.number().int().optional(),
        shares: z.array(shareInput).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, active, shares, ...rest } = input
      const now = Date.now()

      const [target] = await ctx.db.select().from(expense).where(eq(expense.id, id))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found' })
      }

      if (shares !== undefined) {
        const hasPositiveShare = shares.some((s) => s.amount > 0)
        if (!hasPositiveShare) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'At least one share must have amount > 0' })
        }
        await validateShares(ctx.db, shares)
      }

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0

      await ctx.db.update(expense).set(setFields).where(eq(expense.id, id))

      if (shares !== undefined) {
        await ctx.db.delete(expenseShare).where(eq(expenseShare.expenseId, id))
        for (const share of shares) {
          await ctx.db.insert(expenseShare).values({
            id: newId(),
            expenseId: id,
            ownerId: share.ownerId,
            amount: share.amount,
            potId: share.potId ?? null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      return loadExpenseWithShares(ctx.db, id)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db.select().from(expense).where(eq(expense.id, input.id))
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found' })
      }

      const now = Date.now()
      await ctx.db
        .update(expense)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(expense.id, input.id))
    }),
})
