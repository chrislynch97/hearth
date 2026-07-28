import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { expense, category, pot } from '../../db/schema'
import type { Expense } from '../../db/schema'
import { newId } from '../../../shared/ids'
import { todayIso } from '../../../shared/dates'
import type { DB } from '../../db/client'
import { recordBillPriceChange } from './billPrices'
import { potManualMonthlyFromDb, seedStandingOrderBaseline } from './standingOrders'

const priceSourceEnum = z.enum(['manual', 'spend_prompt'])

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
  includeInEmergencyFund: z.boolean().optional(),
})

/** Validate the funding shape and that potId/categoryId refer to real rows in this household. */
async function validateBill(
  db: DB,
  householdId: string,
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
    const [p] = await db.select().from(pot).where(scopeWhere(householdId, pot.householdId, eq(pot.id, input.potId)))
    if (!p) throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
  }
  if (input.categoryId) {
    const [c] = await db
      .select()
      .from(category)
      .where(scopeWhere(householdId, category.householdId, eq(category.id, input.categoryId)))
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

async function loadExpense(db: DB, householdId: string, id: string): Promise<Expense> {
  const [row] = await db.select().from(expense).where(scopeWhere(householdId, expense.householdId, eq(expense.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bill not found' })
  return row
}

export const expensesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(expense)
      .where(scopeWhere(ctx.householdId, expense.householdId, isNull(expense.archivedAt)))
      .orderBy(asc(expense.name))
  }),

  create: publicProcedure.input(billInput).mutation(async ({ ctx, input }) => {
    await validateBill(ctx.db, ctx.householdId, input)
    const now = new Date()
    const id = newId()
    const ff = fundingFields(input)

    await ctx.db.insert(expense).values({
      id,
      householdId: ctx.householdId,
      name: input.name,
      recurrence: input.recurrence,
      amount: input.amount,
      funding: ff.funding,
      potId: ff.potId,
      categoryId: ff.categoryId,
      note: input.note ?? null,
      includeInEmergencyFund: input.includeInEmergencyFund === false ? 0 : 1,
      dueAnchor: input.dueAnchor ?? null,
      dueReminderDays: input.dueReminderDays ?? null,
      createdAt: now,
      updatedAt: now,
    })

    const created = await loadExpense(ctx.db, ctx.householdId, id)
    recordAudit(ctx, { entityType: 'expense', entityId: id, action: 'create', after: created })
    return created
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().min(1).optional(),
        recurrence: recurrenceEnum.optional(),
        amount: z.number().int().min(0).optional(),
        funding: fundingEnum.optional(),
        potId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        note: z.string().optional(),
        active: z.boolean().optional(),
        includeInEmergencyFund: z.boolean().optional(),
        dueAnchor: z.string().optional(),
        dueReminderDays: z.number().int().optional(),
        // When the amount changes, record it as price history (issue #68).
        // `priceSource` marks how strong the evidence is; `priceEffectiveDate`
        // is when the new price took effect (the spend's date, or today).
        priceSource: priceSourceEnum.optional(),
        priceEffectiveDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, active, includeInEmergencyFund, funding, potId, categoryId, priceSource, priceEffectiveDate, ...rest } =
        input
      const now = new Date()
      const target = await loadExpense(ctx.db, ctx.householdId, id)

      // Resolve the effective funding shape (partial updates fall back to stored values).
      const effectiveFunding = (funding ?? target.funding) as 'pot_manual' | 'pot_auto' | 'main'
      const effectivePot = potId !== undefined ? potId : target.potId
      const effectiveCat = categoryId !== undefined ? categoryId : target.categoryId

      const fundingTouched = funding !== undefined || potId !== undefined || categoryId !== undefined
      if (fundingTouched) {
        await validateBill(ctx.db, ctx.householdId, { funding: effectiveFunding, potId: effectivePot, categoryId: effectiveCat })
      }

      // Capture the pot's pre-change standing-order requirement (issue #69) while
      // the DB still holds the old price, so a first bill change gives the alert a
      // "was" to compare against. Only when the bill stays on the same pot_manual
      // pot — a move/funding change is a different (rarer) shape we don't seed for.
      const newAmount = rest.amount
      const priceChanging = newAmount !== undefined && newAmount !== target.amount
      const staysOnPot =
        target.funding === 'pot_manual' && target.potId != null && effectiveFunding === 'pot_manual' && effectivePot === target.potId
      const seedPotId = priceChanging && staysOnPot ? target.potId : null
      const priorMonthly = seedPotId ? await potManualMonthlyFromDb(ctx, seedPotId) : 0

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0
      if (includeInEmergencyFund !== undefined) setFields['includeInEmergencyFund'] = includeInEmergencyFund ? 1 : 0
      if (fundingTouched) {
        const ff = fundingFields({ funding: effectiveFunding, potId: effectivePot, categoryId: effectiveCat })
        setFields['funding'] = ff.funding
        setFields['potId'] = ff.potId
        setFields['categoryId'] = ff.categoryId
      }

      const [written] = await ctx.db
        .update(expense)
        .set(setFields)
        .where(scopeWhere(ctx.householdId, expense.householdId, eq(expense.id, id), versionGuard(expense.updatedAt, expectedUpdatedAt)))
        .returning({ id: expense.id })
      if (!written) {
        const [current] = await ctx.db
          .select({ id: expense.id })
          .from(expense)
          .where(scopeWhere(ctx.householdId, expense.householdId, eq(expense.id, id)))
        throwStaleWrite('Bill', current != null)
      }
      const after = await loadExpense(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'expense', entityId: id, action: 'update', before: target, after })

      if (priceChanging && newAmount !== undefined) {
        await recordBillPriceChange(ctx, target, newAmount, priceSource ?? 'manual', priceEffectiveDate ?? todayIso())
      }
      if (seedPotId) {
        await seedStandingOrderBaseline(ctx, seedPotId, priorMonthly, now)
      }
      return after
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await loadExpense(ctx.db, ctx.householdId, input.id)
      const now = new Date()
      await ctx.db
        .update(expense)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, expense.householdId, eq(expense.id, input.id)))
      recordAudit(ctx, { entityType: 'expense', entityId: input.id, action: 'archive', before: target })
    }),
})
