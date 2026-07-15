import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { household, member, membership, session, user } from '../db/schema'
import { scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { isUniqueViolation } from '../db/errors'
import { verifyPassword } from '../auth/password'
import { MAX_PASSWORD_LENGTH } from '../../shared/password-policy'
import { MAX_NAME_LENGTH } from '../../shared/input-limits'
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

  /** Update the current user's own profile.
   *
   *  Changing the username or the email requires the current password, mirroring
   *  `disableMfa`. Both are identity-bearing: the username is what you log in
   *  with, and the email is the future recovery address. A stolen session could
   *  otherwise silently rename the account and point recovery at the attacker,
   *  locking the real owner out of their own instance without ever knowing the
   *  password (issue #50). `displayName` is cosmetic and stays unconfirmed. */
  updateProfile: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
        displayName: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
        email: z.string().email().max(MAX_NAME_LENGTH).nullable().optional(),
        currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
      const before = await getUser(ctx.db, ctx.userId)
      if (!before) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })

      // Compare against the stored values, not merely "the field was supplied":
      // a form that always posts every field would otherwise demand a password
      // for a display-name-only edit. An open (password-less) instance has no
      // password to confirm, so there is nothing to check.
      const changesUsername = input.username !== undefined && normalizeUsername(input.username) !== before.username
      const changesEmail = input.email !== undefined && (input.email || null) !== before.email
      if ((changesUsername || changesEmail) && before.passwordHash !== null) {
        if (!(await verifyPassword(input.currentPassword ?? '', before.passwordHash))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
        }
      }

      // Friendly best-effort check; the unique index on user.username is the real
      // guard against a concurrent same-username race (handled below).
      if (input.username !== undefined) {
        const clash = await getUserByUsername(ctx.db, input.username.trim())
        if (clash && clash.id !== ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
      }

      try {
        await ctx.db
          .update(user)
          .set({
            ...(input.username !== undefined ? { username: normalizeUsername(input.username) } : {}),
            ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            updatedAt: new Date(),
          })
          .where(eq(user.id, ctx.userId))
      } catch (err) {
        // Two renames to the same name can both pass the check above under
        // Postgres's real concurrency; the unique index makes the loser throw
        // here. Turn that into the same friendly message rather than the raw 500
        // the constraint would otherwise surface as (issue #50), matching
        // `auth.register`.
        if (isUniqueViolation(err)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
        throw err
      }

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
