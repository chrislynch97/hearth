import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { expense, category, pot } from '../db/schema'
import type { Expense } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'yearly'])
const fundingEnum = z.enum(['pot_manual', 'pot_auto', 'main'])

// A bill is single-pot. `funding` decides the shape:
//   pot_manual / pot_auto → potId required (auto = the pot self-deducts, no catch-up)
//   main                  → categoryId required, no pot (paid from the main account)
const billInput = z.object({
  name: z.string().min(1),
  recurrence: recurrenceEnum,
  amount: z.number().int().min(0),
  funding: fundingEnum,
  potId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  note: z.string().optional(),
  dueAnchor: z.string().optional(),
  dueReminderDays: z.number().int().optional(),
})

/** Validate the funding shape and that potId/categoryId refer to real rows. */
async function validateBill(
  db: DB,
  input: { funding: 'pot_manual' | 'pot_auto' | 'main'; potId?: string | null; categoryId?: string | null },
): Promise<void> {
  if (input.funding === 'main') {
    if (!input.categoryId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A main-account bill needs a category' })
    }
  } else if (!input.potId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A pot-funded bill needs a pot' })
  }

  if (input.potId) {
    const [p] = await db.select().from(pot).where(eq(pot.id, input.potId))
    if (!p) throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
  }
  if (input.categoryId) {
    const [c] = await db.select().from(category).where(eq(category.id, input.categoryId))
    if (!c) throw new TRPCError({ code: 'BAD_REQUEST', message: 'categoryId does not refer to an existing category' })
  }
}

/** Normalise the stored fields for a given funding mode (main clears the pot; pot modes clear the category). */
function fundingFields(input: { funding: 'pot_manual' | 'pot_auto' | 'main'; potId?: string | null; categoryId?: string | null }): {
  funding: string
  potId: string | null
  categoryId: string | null
} {
  if (input.funding === 'main') {
    return { funding: 'main', potId: null, categoryId: input.categoryId ?? null }
  }
  return { funding: input.funding, potId: input.potId ?? null, categoryId: null }
}

async function loadExpense(db: DB, id: string): Promise<Expense> {
  const [row] = await db.select().from(expense).where(eq(expense.id, id))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bill not found' })
  return row
}

export const expensesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(expense).where(isNull(expense.archivedAt)).orderBy(asc(expense.name))
  }),

  create: publicProcedure.input(billInput).mutation(async ({ ctx, input }) => {
    await validateBill(ctx.db, input)
    const now = Date.now()
    const id = newId()
    const ff = fundingFields(input)

    await ctx.db.insert(expense).values({
      id,
      name: input.name,
      recurrence: input.recurrence,
      amount: input.amount,
      funding: ff.funding,
      potId: ff.potId,
      categoryId: ff.categoryId,
      note: input.note ?? null,
      dueAnchor: input.dueAnchor ?? null,
      dueReminderDays: input.dueReminderDays ?? null,
      createdAt: now,
      updatedAt: now,
    })

    return loadExpense(ctx.db, id)
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        recurrence: recurrenceEnum.optional(),
        amount: z.number().int().min(0).optional(),
        funding: fundingEnum.optional(),
        potId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        note: z.string().optional(),
        active: z.boolean().optional(),
        dueAnchor: z.string().optional(),
        dueReminderDays: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, active, funding, potId, categoryId, ...rest } = input
      const now = Date.now()
      const target = await loadExpense(ctx.db, id)

      // Resolve the effective funding shape (partial updates fall back to stored values).
      const effectiveFunding = (funding ?? target.funding) as 'pot_manual' | 'pot_auto' | 'main'
      const effectivePot = potId !== undefined ? potId : target.potId
      const effectiveCat = categoryId !== undefined ? categoryId : target.categoryId

      const fundingTouched = funding !== undefined || potId !== undefined || categoryId !== undefined
      if (fundingTouched) {
        await validateBill(ctx.db, { funding: effectiveFunding, potId: effectivePot, categoryId: effectiveCat })
      }

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0
      if (fundingTouched) {
        const ff = fundingFields({ funding: effectiveFunding, potId: effectivePot, categoryId: effectiveCat })
        setFields['funding'] = ff.funding
        setFields['potId'] = ff.potId
        setFields['categoryId'] = ff.categoryId
      }

      await ctx.db.update(expense).set(setFields).where(eq(expense.id, id))
      return loadExpense(ctx.db, id)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadExpense(ctx.db, input.id)
      const now = Date.now()
      await ctx.db.update(expense).set({ archivedAt: now, updatedAt: now }).where(eq(expense.id, input.id))
    }),
})
