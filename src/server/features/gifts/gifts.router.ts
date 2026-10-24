import { z } from 'zod'
import { asc, eq, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { gift, giftOccasion, giftRecipient } from '../../db/schema'
import type { Gift, GiftOccasion, GiftRecipient } from '../../db/schema'
import { newId } from '@shared/ids'
import { GIFT_STATUSES, allocatedBudget, budgetCovering, giftTotals } from './gifts'
import type { GiftTotals } from './gifts'
import type { DB, Tx } from '../../db/client'

const STATUS = z.enum(GIFT_STATUSES)
const BUDGET = z.number().int().nonnegative().nullable()
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()

async function getOccasion(db: DB | Tx, householdId: string, id: string): Promise<GiftOccasion> {
  const [row] = await db
    .select()
    .from(giftOccasion)
    .where(scopeWhere(householdId, giftOccasion.householdId, eq(giftOccasion.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Occasion not found' })
  return row
}

async function getRecipient(db: DB | Tx, householdId: string, id: string): Promise<GiftRecipient> {
  const [row] = await db
    .select()
    .from(giftRecipient)
    .where(scopeWhere(householdId, giftRecipient.householdId, eq(giftRecipient.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' })
  return row
}

async function getGift(db: DB, householdId: string, id: string): Promise<Gift> {
  const [row] = await db.select().from(gift).where(scopeWhere(householdId, gift.householdId, eq(gift.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Gift not found' })
  return row
}

export interface OccasionSummary extends GiftOccasion {
  totals: GiftTotals
  /** What the people's own budgets add up to. */
  allocated: number
}

export interface RecipientWithGifts extends GiftRecipient {
  gifts: Gift[]
  totals: GiftTotals
}

export interface OccasionDetail extends OccasionSummary {
  recipients: RecipientWithGifts[]
}

/** Raise an occasion's budget to cover its people's budgets once they go past
 *  it. Returns the new budget, or null when nothing needed raising. */
async function coverPeopleBudgets(
  tx: Tx,
  ctx: Parameters<typeof recordAudit>[0] & { householdId: string },
  occasionId: string,
): Promise<number | null> {
  const before = await getOccasion(tx, ctx.householdId, occasionId)
  const people = await tx
    .select({ budget: giftRecipient.budget })
    .from(giftRecipient)
    .where(scopeWhere(ctx.householdId, giftRecipient.householdId, eq(giftRecipient.occasionId, occasionId)))
  const budget = budgetCovering(before.budget, allocatedBudget(people))
  if (budget === before.budget) return null
  const [after] = await tx
    .update(giftOccasion)
    .set({ budget, updatedAt: new Date() })
    .where(scopeWhere(ctx.householdId, giftOccasion.householdId, eq(giftOccasion.id, occasionId)))
    .returning()
  recordAudit(ctx, { entityType: 'giftOccasion', entityId: occasionId, action: 'update', before, after })
  return budget
}

export const giftsRouter = router({
  /** Every occasion, archived included, soonest-dated first, with its totals. */
  occasions: publicProcedure.query(async ({ ctx }): Promise<OccasionSummary[]> => {
    const occasions = await ctx.db
      .select()
      .from(giftOccasion)
      .where(scopeWhere(ctx.householdId, giftOccasion.householdId))
      .orderBy(asc(giftOccasion.date), asc(giftOccasion.name))
    const rows = await ctx.db
      .select({ occasionId: giftRecipient.occasionId, amount: gift.amount, status: gift.status })
      .from(gift)
      .innerJoin(giftRecipient, eq(gift.recipientId, giftRecipient.id))
      .where(scopeWhere(ctx.householdId, gift.householdId))
    const people = await ctx.db
      .select({ occasionId: giftRecipient.occasionId, budget: giftRecipient.budget })
      .from(giftRecipient)
      .where(scopeWhere(ctx.householdId, giftRecipient.householdId))
    return occasions.map((o) => ({
      ...o,
      totals: giftTotals(
        o.budget,
        rows.filter((r) => r.occasionId === o.id),
      ),
      allocated: allocatedBudget(people.filter((p) => p.occasionId === o.id)),
    }))
  }),

  /** One occasion with its people, their gifts and every total. */
  occasion: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }): Promise<OccasionDetail> => {
    const occasion = await getOccasion(ctx.db, ctx.householdId, input.id)
    const recipients = await ctx.db
      .select()
      .from(giftRecipient)
      .where(scopeWhere(ctx.householdId, giftRecipient.householdId, eq(giftRecipient.occasionId, input.id)))
      .orderBy(asc(giftRecipient.sortOrder), asc(giftRecipient.name))
    const gifts = (
      await ctx.db
        .select({ gift })
        .from(gift)
        .innerJoin(giftRecipient, eq(gift.recipientId, giftRecipient.id))
        .where(scopeWhere(ctx.householdId, gift.householdId, eq(giftRecipient.occasionId, input.id)))
        .orderBy(asc(gift.createdAt))
    ).map((r) => r.gift)
    return {
      ...occasion,
      totals: giftTotals(occasion.budget, gifts),
      allocated: allocatedBudget(recipients),
      recipients: recipients.map((r) => {
        const own = gifts.filter((g) => g.recipientId === r.id)
        return { ...r, gifts: own, totals: giftTotals(r.budget, own) }
      }),
    }
  }),

  createOccasion: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        date: DATE.optional(),
        budget: BUDGET.optional(),
        /** Copy this occasion's people and their budgets (not their gifts). */
        copyFromId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let source: GiftRecipient[] = []
      if (input.copyFromId) {
        await getOccasion(ctx.db, ctx.householdId, input.copyFromId)
        source = await ctx.db
          .select()
          .from(giftRecipient)
          .where(scopeWhere(ctx.householdId, giftRecipient.householdId, eq(giftRecipient.occasionId, input.copyFromId)))
      }
      const now = new Date()
      const id = newId()
      const raisedOccasionBudget = await ctx.db.transaction(async (tx) => {
        await tx.insert(giftOccasion).values({
          id,
          householdId: ctx.householdId,
          name: input.name,
          date: input.date ?? null,
          budget: input.budget ?? null,
          createdAt: now,
          updatedAt: now,
        })
        if (source.length > 0) {
          await tx.insert(giftRecipient).values(
            source.map((r) => ({
              id: newId(),
              householdId: ctx.householdId,
              occasionId: id,
              name: r.name,
              budget: r.budget,
              sortOrder: r.sortOrder,
              createdAt: now,
              updatedAt: now,
            })),
          )
        }
        return coverPeopleBudgets(tx, ctx, id)
      })
      const created = await getOccasion(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'giftOccasion', entityId: id, action: 'create', after: created })
      return { ...created, raisedOccasionBudget }
    }),

  updateOccasion: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().trim().min(1).optional(),
        date: DATE.optional(),
        budget: BUDGET.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...rest } = input
      const before = await getOccasion(ctx.db, ctx.householdId, id)
      const [written] = await ctx.db
        .update(giftOccasion)
        .set({ ...rest, updatedAt: new Date() })
        .where(
          scopeWhere(
            ctx.householdId,
            giftOccasion.householdId,
            eq(giftOccasion.id, id),
            versionGuard(giftOccasion.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
      if (!written) throwStaleWrite('Occasion', true)
      recordAudit(ctx, { entityType: 'giftOccasion', entityId: id, action: 'update', before, after: written })
      return written
    }),

  /** Archive (or bring back) an occasion — keeps last year's out of the way. */
  setArchived: publicProcedure
    .input(z.object({ id: z.string(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const before = await getOccasion(ctx.db, ctx.householdId, input.id)
      const now = new Date()
      const [after] = await ctx.db
        .update(giftOccasion)
        .set({ archivedAt: input.archived ? now : null, updatedAt: now })
        .where(scopeWhere(ctx.householdId, giftOccasion.householdId, eq(giftOccasion.id, input.id)))
        .returning()
      recordAudit(ctx, {
        entityType: 'giftOccasion',
        entityId: input.id,
        action: input.archived ? 'archive' : 'update',
        before,
        after,
      })
      return after!
    }),

  /** Hard-delete an occasion with its people and gifts (cascade). */
  removeOccasion: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getOccasion(ctx.db, ctx.householdId, input.id)
    await ctx.db
      .delete(giftOccasion)
      .where(scopeWhere(ctx.householdId, giftOccasion.householdId, eq(giftOccasion.id, input.id)))
    recordAudit(ctx, { entityType: 'giftOccasion', entityId: input.id, action: 'delete', before: target })
  }),

  // -- People --------------------------------------------------------------

  createRecipient: publicProcedure
    .input(z.object({ occasionId: z.string(), name: z.string().trim().min(1), budget: BUDGET.optional() }))
    .mutation(async ({ ctx, input }) => {
      await getOccasion(ctx.db, ctx.householdId, input.occasionId)
      const [result] = await ctx.db
        .select({ maxOrder: max(giftRecipient.sortOrder) })
        .from(giftRecipient)
        .where(scopeWhere(ctx.householdId, giftRecipient.householdId, eq(giftRecipient.occasionId, input.occasionId)))
      const now = new Date()
      const id = newId()
      const raisedOccasionBudget = await ctx.db.transaction(async (tx) => {
        await tx.insert(giftRecipient).values({
          id,
          householdId: ctx.householdId,
          occasionId: input.occasionId,
          name: input.name,
          budget: input.budget ?? null,
          sortOrder: (result?.maxOrder ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
        })
        return coverPeopleBudgets(tx, ctx, input.occasionId)
      })
      const created = await getRecipient(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'giftRecipient', entityId: id, action: 'create', after: created })
      return { ...created, raisedOccasionBudget }
    }),

  updateRecipient: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().trim().min(1).optional(),
        budget: BUDGET.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...rest } = input
      const before = await getRecipient(ctx.db, ctx.householdId, id)
      const { written, raisedOccasionBudget } = await ctx.db.transaction(async (tx) => {
        const [written] = await tx
          .update(giftRecipient)
          .set({ ...rest, updatedAt: new Date() })
          .where(
            scopeWhere(
              ctx.householdId,
              giftRecipient.householdId,
              eq(giftRecipient.id, id),
              versionGuard(giftRecipient.updatedAt, expectedUpdatedAt),
            ),
          )
          .returning()
        if (!written) throwStaleWrite('Person', true)
        return { written, raisedOccasionBudget: await coverPeopleBudgets(tx, ctx, before.occasionId) }
      })
      recordAudit(ctx, { entityType: 'giftRecipient', entityId: id, action: 'update', before, after: written })
      return { ...written, raisedOccasionBudget }
    }),

  /** Remove a person and their gifts (cascade). */
  removeRecipient: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getRecipient(ctx.db, ctx.householdId, input.id)
    await ctx.db
      .delete(giftRecipient)
      .where(scopeWhere(ctx.householdId, giftRecipient.householdId, eq(giftRecipient.id, input.id)))
    recordAudit(ctx, { entityType: 'giftRecipient', entityId: input.id, action: 'delete', before: target })
  }),

  // -- Gifts ---------------------------------------------------------------

  createGift: publicProcedure
    .input(
      z.object({
        recipientId: z.string(),
        name: z.string().trim().min(1),
        amount: z.number().int().nonnegative(),
        status: STATUS,
        link: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getRecipient(ctx.db, ctx.householdId, input.recipientId)
      const now = new Date()
      const id = newId()
      await ctx.db.insert(gift).values({
        id,
        householdId: ctx.householdId,
        recipientId: input.recipientId,
        name: input.name,
        amount: input.amount,
        status: input.status,
        link: input.link ?? null,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const created = await getGift(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'gift', entityId: id, action: 'create', after: created })
      return created
    }),

  updateGift: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        recipientId: z.string().optional(),
        name: z.string().trim().min(1).optional(),
        amount: z.number().int().nonnegative().optional(),
        status: STATUS.optional(),
        link: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...rest } = input
      const before = await getGift(ctx.db, ctx.householdId, id)
      if (rest.recipientId !== undefined && rest.recipientId !== before.recipientId) {
        const [from, to] = await Promise.all([
          getRecipient(ctx.db, ctx.householdId, before.recipientId),
          getRecipient(ctx.db, ctx.householdId, rest.recipientId),
        ])
        if (from.occasionId !== to.occasionId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A gift can only move to someone on the same occasion' })
        }
      }
      const [written] = await ctx.db
        .update(gift)
        .set({ ...rest, updatedAt: new Date() })
        .where(scopeWhere(ctx.householdId, gift.householdId, eq(gift.id, id), versionGuard(gift.updatedAt, expectedUpdatedAt)))
        .returning()
      if (!written) throwStaleWrite('Gift', true)
      recordAudit(ctx, { entityType: 'gift', entityId: id, action: 'update', before, after: written })
      return written
    }),

  removeGift: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const target = await getGift(ctx.db, ctx.householdId, input.id)
    await ctx.db.delete(gift).where(scopeWhere(ctx.householdId, gift.householdId, eq(gift.id, input.id)))
    recordAudit(ctx, { entityType: 'gift', entityId: input.id, action: 'delete', before: target })
  }),
})
