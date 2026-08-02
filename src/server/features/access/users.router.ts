import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { household, member, membership, session, user } from '../../db/schema'
import { DEFAULT_HOUSEHOLD_ID, scopeWhere } from '../../trpc/tenant'
import { recordAudit, recordSecurityEvent } from '../../trpc/audit'
import { isUniqueViolation } from '../../db/errors'
import { verifyPassword } from '../../auth/password'
import { MAX_PASSWORD_LENGTH } from '../../../shared/password-policy'
import { MAX_CODE_LENGTH, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from '../../../shared/input-limits'
import { emailRequiredForAccounts } from '../../auth/accountEmail'
import { accountDeletionImpact, accountReference, deleteUsers } from '../../auth/accountDeletion'
import { verifyMfaCode } from '../../auth/mfa'
import { acceptedMembership, getUser, getUserByUsername, getValidSession, isInstanceOwner, normalizeUsername } from '../../auth/session'

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
      emailVerified: u.emailVerifiedAt !== null,
      activeHouseholdId: ctx.householdId,
      // Whether the active household is the instance's primary one. Several
      // tenant-facing actions are refused there (erasure is the instance-wide
      // `reset` instead), and the UI has to explain that rather than guess at the
      // magic id — which the client has no business knowing.
      isPrimaryHousehold: ctx.householdId === DEFAULT_HOUSEHOLD_ID,
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
        email: z.string().email().max(MAX_EMAIL_LENGTH).nullable().optional(),
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
      // Where an address is required (#199), clearing one is a downgrade back to
      // "no recovery route" — refuse it. Replacing it is still fine, and an
      // account that never had one is left alone rather than blocked from saving
      // an unrelated edit.
      if (changesEmail && !input.email && before.email !== null && emailRequiredForAccounts()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This instance needs an email address on your account — change it rather than removing it.',
        })
      }
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
            // A new address is unproven until it's clicked a verification link,
            // even if the old one was verified — otherwise moving the address
            // would silently carry the recovery route over to it (#111).
            ...(changesEmail ? { emailVerifiedAt: null } : {}),
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

  /** What deleting your own account would do, for the confirmation screen (#230).
   *
   *  Same rules the mutation enforces, read-only, so the UI can state the outcome
   *  before anyone types a password rather than after — including the households
   *  that would go with the account, and the ones that refuse to let it go. */
  deletionImpact: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    const me = await getUser(ctx.db, ctx.userId)
    if (!me) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    const impact = await accountDeletionImpact(ctx.db, me.id)
    return {
      ...impact,
      isInstanceOwner: await isInstanceOwner(ctx.db, me.id),
      passwordRequired: me.passwordHash !== null,
      mfaRequired: me.mfaEnabledAt !== null && me.mfaSecret !== null,
    }
  }),

  /** Delete your own account (#230). GDPR erasure is about the person, not the
   *  tenant: `data.eraseHousehold` removes a household, but `user` has no FK to
   *  one, so the login — username, email, password hash, MFA secret — outlived
   *  every household the person belonged to with nothing to remove it.
   *
   *  Confirmed by password and, where enrolled, MFA — the same bar as the other
   *  destructive account actions, because a stolen session must not be able to
   *  erase the real owner. Refused for the instance owner outright (that account
   *  is the instance's root of trust; removing it is a redeploy, not a button)
   *  and while the caller is the sole owner of a household others still belong
   *  to. Households nobody else belongs to go with the account — leaving one
   *  behind would strand a household's financial records where nobody can ever
   *  reach or erase them. */
  deleteAccount: publicProcedure
    .input(
      z.object({
        currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(),
        code: z.string().max(MAX_CODE_LENGTH).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
      const me = await getUser(ctx.db, ctx.userId)
      if (!me) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })

      if (await isInstanceOwner(ctx.db, me.id)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'This is the instance owner’s account, so it can’t be deleted from here — removing it means taking the instance down.',
        })
      }
      // An open (password-less) instance has no password to confirm; the MFA
      // check below only applies to an account that actually enrolled.
      if (me.passwordHash !== null && !(await verifyPassword(input.currentPassword ?? '', me.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      if (me.mfaEnabledAt && me.mfaSecret) {
        if (!input.code || !(await verifyMfaCode(ctx.db, me, input.code))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      const { blockedBy, households } = await accountDeletionImpact(ctx.db, me.id)
      if (blockedBy.length > 0) {
        const names = blockedBy.map((h) => h.name).join(', ')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You’re the only owner of ${names}, and other people are still in there. Make someone else an owner, or delete the household, before deleting your account.`,
        })
      }

      // One transaction: the account, the households nobody else is left in, and
      // the member rows that pointed at the account all have to move together.
      await ctx.db.transaction(async (tx) => {
        await deleteUsers(tx, [me.id])
        if (households.length > 0) {
          await tx.delete(household).where(
            inArray(
              household.id,
              households.map((h) => h.id),
            ),
          )
        }
      })

      // Recorded against the primary household with a non-reversible reference
      // and no actor: the account is gone, and an entry naming it would keep the
      // identity the erasure existed to remove. The primary household is also the
      // only one guaranteed to outlive this — an entry on a household deleted
      // just above would vanish with it (the trick `eraseHousehold` uses).
      const reference = accountReference(me.id)
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: reference,
        action: 'account_deleted',
        details: { reference, households: households.length, via: 'self_service' },
        householdId: DEFAULT_HOUSEHOLD_ID,
        actorUserId: null,
      })
      for (const h of households) {
        recordSecurityEvent(ctx, {
          entityType: 'household',
          entityId: h.id,
          action: 'household_erased',
          details: { via: 'account_deleted', reference },
          householdId: DEFAULT_HOUSEHOLD_ID,
          actorUserId: null,
        })
      }
      ctx.setSessionCookie?.(null)
      return { ok: true as const, householdsDeleted: households.length }
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
