import { z } from 'zod'
import { eq, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { member, membership } from '../db/schema'
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
      const now = Date.now()

      // Compute next sortOrder
      const [result] = await ctx.db
        .select({ maxOrder: max(member.sortOrder) })
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId))
      const nextOrder = (result?.maxOrder ?? 0) + 1

      const id = newId()
      await ctx.db.insert(member).values({
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

      const [inserted] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, id)))

      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to insert member' })
      }

      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().min(1).optional(),
        shortLabel: z.string().optional(),
        color: z.string().optional(),
        jointContributionWeight: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const now = Date.now()

      await ctx.db
        .update(member)
        .set({ ...fields, updatedAt: now })
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, id)))

      const [updated] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, id)))

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })
      }

      return updated
    }),

  /** Link a budgeting member to a user account (or clear it with userId: null).
   *  The mapping is one-to-one within a household: linking a user moves it off
   *  any member it was previously on. Admin+ only. */
  linkUser: publicProcedure
    .input(z.object({ memberId: z.string(), userId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      const now = Date.now()

      const [target] = await ctx.db
        .select()
        .from(member)
        .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.memberId)))
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })

      if (input.userId) {
        const [grant] = await ctx.db
          .select()
          .from(membership)
          .where(scopeWhere(ctx.householdId, membership.householdId, eq(membership.userId, input.userId)))
        if (!grant || grant.acceptedAt === null) {
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

      const now = Date.now()
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
