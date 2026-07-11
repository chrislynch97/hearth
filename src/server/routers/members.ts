import { z } from 'zod'
import { eq, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { member } from '../db/schema'
import { acceptedMembership } from '../auth/session'
import { newId } from '../../shared/ids'

export const membersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId))
      .orderBy(member.sortOrder)
  }),

  addPerson: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(1),
        shortLabel: z.string().optional(),
        color: z.string().optional(),
        jointContributionWeight: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()

      // Compute next sortOrder
      const [result] = await ctx.db
        .select({ maxOrder: max(member.sortOrder) })
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId))
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      const [inserted] = await ctx.db
        .insert(member)
        .values({
          id,
          householdId: ctx.householdId,
          kind: 'person',
          displayName: input.displayName,
          shortLabel: input.shortLabel ?? null,
          color: input.color ?? null,
          jointContributionWeight: input.jointContributionWeight ?? null,
          sortOrder: nextOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return inserted!
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        displayName: z.string().min(1).optional(),
        shortLabel: z.string().optional(),
        color: z.string().optional(),
        jointContributionWeight: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...fields } = input
      const now = new Date()

      const [updated] = await ctx.db
        .update(member)
        .set({ ...fields, updatedAt: now })
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, id), versionGuard(member.updatedAt, expectedUpdatedAt)))
        .returning()

      if (updated) return updated

      const [current] = await ctx.db
        .select({ id: member.id })
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, id)))
      throwStaleWrite('Member', current != null)
    }),

  /** Link a budgeting member to a user account (or clear it with userId: null).
   *  The mapping is one-to-one within a household: linking a user moves it off
   *  any member it was previously on. Admin+ only. */
  linkUser: publicProcedure
    .input(z.object({ memberId: z.string(), userId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      const now = new Date()

      const [target] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.memberId)))
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })

      if (input.userId) {
        const grant = await acceptedMembership(ctx.db, ctx.householdId, input.userId)
        if (!grant) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That account is not a member of this household.' })
        }
        // One user ↔ one member: release the account from any other member first.
        await ctx.db
          .update(member)
          .set({ userId: null, updatedAt: now })
          .where(scopeWhere(ctx.householdId, member.householdId, eq(member.userId, input.userId)))
      }

      await ctx.db
        .update(member)
        .set({ userId: input.userId, updatedAt: now })
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.memberId)))
      return { ok: true as const }
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.id)))

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })
      }

      if (target.kind === 'joint') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The joint member cannot be archived',
        })
      }

      const now = new Date()
      await ctx.db
        .update(member)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.id)))

      const [updated] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.id)))
      return updated
    }),
})
