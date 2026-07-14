import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { household, member, membership, session, user } from '../db/schema'
import { scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { acceptedMembership, getUser, getUserByUsername, getValidSession, isInstanceOwner, normalizeUsername } from '../auth/session'

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

    // The budgeting member this account maps to in the active household, if any —
    // lets the app greet you by your name and know which participant you are.
    const [linked] = await ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId, eq(member.userId, u.id)))

    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      activeHouseholdId: ctx.householdId,
      role: ctx.role ?? null,
      // Instance operator = the single account controlling instance-wide actions.
      // Derived from the same source of truth as server enforcement (not a second
      // inline predicate), so the UI gate can't diverge from what the server
      // allows. Gates instance-wide controls (e.g. open registration) in the UI;
      // the server re-checks.
      isInstanceOwner: await isInstanceOwner(ctx.db, u.id),
      linkedMemberId: linked?.id ?? null,
      linkedMemberName: linked?.displayName ?? null,
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

      const before = await getUser(ctx.db, ctx.userId)

      await ctx.db
        .update(user)
        .set({
          ...(input.username !== undefined ? { username: normalizeUsername(input.username) } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, ctx.userId))

      const updated = await getUser(ctx.db, ctx.userId)
      // Audit only the profile fields (issue #49) — never the password hash or MFA
      // columns that also live on the user row.
      const fields = (u: typeof updated) => ({ username: u!.username, displayName: u!.displayName, email: u!.email })
      recordAudit(ctx, {
        entityType: 'user',
        entityId: ctx.userId,
        action: 'update',
        before: fields(before),
        after: fields(updated),
      })
      return { id: updated!.id, username: updated!.username, displayName: updated!.displayName, email: updated!.email }
    }),

  /** Switch the active household for this session. */
  switchHousehold: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const s = await getValidSession(ctx.db, ctx.sessionToken)
      if (!s) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No active session' })

      const grant = await acceptedMembership(ctx.db, input.householdId, s.userId)
      if (!grant) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of that household.' })
      }

      await ctx.db
        .update(session)
        .set({ activeHouseholdId: input.householdId })
        .where(eq(session.id, s.id))
      return { activeHouseholdId: input.householdId }
    }),
})
