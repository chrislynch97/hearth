import { z } from 'zod'
import { asc, eq, isNull, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertMember, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { pot, expense, setAside, spendTransaction, reconciliationBatch } from '../db/schema'
import { newId } from '../../shared/ids'
import { contributionLineInput, insertContributionLines } from './setAside'

export const potsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(pot)
      .where(scopeWhere(ctx.householdId, pot.householdId, isNull(pot.archivedAt)))
      .orderBy(asc(pot.sortOrder), asc(pot.name))
  }),

  // Pots referenced by a current bill, a set-aside, a spend, or a reconciliation
  // batch. Anything not in this set has never been used and is safe to delete.
  usedIds: publicProcedure.query(async ({ ctx }) => {
    const [bills, setAsides, spends, batches] = await Promise.all([
      ctx.db
        .select({ potId: expense.potId })
        .from(expense)
        .where(scopeWhere(ctx.householdId, expense.householdId)),
      ctx.db
        .select({ potId: setAside.potId })
        .from(setAside)
        .where(scopeWhere(ctx.householdId, setAside.householdId)),
      ctx.db
        .select({ potId: spendTransaction.potId })
        .from(spendTransaction)
        .where(scopeWhere(ctx.householdId, spendTransaction.householdId)),
      ctx.db
        .select({ potId: reconciliationBatch.potId })
        .from(reconciliationBatch)
        .where(scopeWhere(ctx.householdId, reconciliationBatch.householdId)),
    ])
    const used = new Set<string>()
    for (const row of [...bills, ...setAsides, ...spends, ...batches]) {
      if (row.potId) used.add(row.potId)
    }
    return [...used]
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        ownerId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()

      // Validate ownerId — must be a member of THIS household.
      await assertMember(ctx.db, ctx.householdId, input.ownerId)

      const [result] = await ctx.db
        .select({ maxOrder: max(pot.sortOrder) })
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId))
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      const [inserted] = await ctx.db
        .insert(pot)
        .values({
          id,
          householdId: ctx.householdId,
          name: input.name,
          categoryId: input.categoryId ?? null,
          ownerId: input.ownerId,
          sortOrder: nextOrder,
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return inserted!
    }),

  // Create a pot and its monthly contribution lines in one transaction. The
  // Pots screen used to fire `pots.create` then `setAside.replaceForPot` as two
  // separate mutations — if the second failed you were left with a pot that had
  // no contributions and no way to undo (issue #33). Doing both in one resolver
  // makes it atomic: either the whole pot lands or none of it does.
  createWithContributions: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        ownerId: z.string(),
        note: z.string().optional(),
        lines: z.array(contributionLineInput),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()

      // Validate ownerId — must be a member of THIS household.
      await assertMember(ctx.db, ctx.householdId, input.ownerId)

      return ctx.db.transaction(async (tx) => {
        const [result] = await tx
          .select({ maxOrder: max(pot.sortOrder) })
          .from(pot)
          .where(scopeWhere(ctx.householdId, pot.householdId))
        const nextOrder = (result?.maxOrder ?? 0) + 1

        const [inserted] = await tx
          .insert(pot)
          .values({
            id: newId(),
            householdId: ctx.householdId,
            name: input.name,
            categoryId: input.categoryId ?? null,
            ownerId: input.ownerId,
            sortOrder: nextOrder,
            note: input.note ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        await insertContributionLines(tx, ctx.householdId, inserted!, input.lines, now)
        return inserted!
      })
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().min(1).optional(),
        categoryId: z.string().nullable().optional(),
        ownerId: z.string().optional(),
        note: z.string().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ownerId, ...rest } = input
      const now = new Date()

      // Validate ownerId if provided — must be a member of THIS household.
      if (ownerId !== undefined) await assertMember(ctx.db, ctx.householdId, ownerId)

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (ownerId !== undefined) setFields['ownerId'] = ownerId

      const [updated] = await ctx.db
        .update(pot)
        .set(setFields)
        .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, id), versionGuard(pot.updatedAt, expectedUpdatedAt)))
        .returning()

      if (updated) return updated

      const [current] = await ctx.db
        .select({ id: pot.id })
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, id)))
      throwStaleWrite('Pot', current != null)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(pot)
        .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, input.id)))

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pot not found' })
      }

      const now = new Date()
      await ctx.db
        .update(pot)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, input.id)))
    }),
})
