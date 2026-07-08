import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { household, membership, session, user } from '../db/schema'
import { getUser, getUserByUsername, getValidSession } from '../auth/session'

export const usersRouter = router({
  /** The current user, their accepted households (with role), and which one is
   *  active. Null only if the request has no resolvable identity. */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null
    const u = await getUser(ctx.db, ctx.userId)
    if (!u) return null

    const grants = (await ctx.db.select().from(membership).where(eq(membership.userId, u.id))).filter(
      (m) => m.acceptedAt !== null,
    )
    const householdIds = grants.map((g) => g.householdId)
    const households = householdIds.length
      ? await ctx.db.select().from(household).where(inArray(household.id, householdIds))
      : []
    const nameById = new Map(households.map((h) => [h.id, h.displayName]))

    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      activeHouseholdId: ctx.householdId,
      role: ctx.role ?? null,
      memberships: grants.map((g) => ({
        householdId: g.householdId,
        householdName: nameById.get(g.householdId) ?? 'Household',
        role: g.role,
      })),
    }
  }),

  /** Update the current user's own profile. */
  updateProfile: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).optional(),
        displayName: z.string().min(1).optional(),
        email: z.string().email().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })

      if (input.username !== undefined) {
        const clash = await getUserByUsername(ctx.db, input.username.trim())
        if (clash && clash.id !== ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
      }

      await ctx.db
        .update(user)
        .set({
          ...(input.username !== undefined ? { username: input.username.trim() } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          updatedAt: Date.now(),
        })
        .where(eq(user.id, ctx.userId))

      const updated = await getUser(ctx.db, ctx.userId)
      return { id: updated!.id, username: updated!.username, displayName: updated!.displayName, email: updated!.email }
    }),

  /** Switch the active household for this session. */
  switchHousehold: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const s = await getValidSession(ctx.db, ctx.sessionToken)
      if (!s) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No active session' })

      const [grant] = await ctx.db
        .select()
        .from(membership)
        .where(and(eq(membership.userId, s.userId), eq(membership.householdId, input.householdId)))
      if (!grant || grant.acceptedAt === null) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of that household.' })
      }

      await ctx.db
        .update(session)
        .set({ activeHouseholdId: input.householdId })
        .where(eq(session.id, s.id))
      return { activeHouseholdId: input.householdId }
    }),
})
