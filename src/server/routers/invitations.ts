import { z } from 'zod'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { household, invitation } from '../db/schema'
import { isUniqueViolation } from '../db/errors'
import { hashPassword } from '../auth/password'
import { createSession, createUserWithMembership, getUserByUsername, newSessionId, normalizeUsername } from '../auth/session'
import { validatePassword, MAX_PASSWORD_LENGTH } from '../../shared/password-policy'
import { MAX_NAME_LENGTH, MAX_TOKEN_LENGTH } from '../../shared/input-limits'
import { RateLimiter } from '../auth/rateLimit'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const inviteRole = z.enum(['admin', 'member', 'viewer'])

// Throttle invite acceptance so the username-taken response can't be used as an
// unbounded enumeration oracle: 10 attempts per hour per client, then a block.
const acceptLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 60 * 60 * 1000,
})

export const invitationsRouter = router({
  /** Pending (unaccepted, unexpired) invitations for the active household. */
  list: publicProcedure.query(async ({ ctx }) => {
    assertRole(ctx.role, 'admin')
    const now = new Date()
    const rows = await ctx.db
      .select()
      .from(invitation)
      .where(scopeWhere(ctx.householdId, invitation.householdId, isNull(invitation.acceptedAt)))
      .orderBy(desc(invitation.createdAt))
    return rows
      .filter((r) => r.expiresAt > now)
      .map((r) => ({ id: r.id, role: r.role, email: r.email, createdAt: r.createdAt, expiresAt: r.expiresAt }))
  }),

  /** Create an invite. Admins can invite member/viewer; owners can also invite
   *  admins. Returns the token — the client builds the shareable link from it. */
  create: publicProcedure
    .input(z.object({ role: inviteRole, email: z.string().email().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, input.role === 'admin' ? 'owner' : 'admin')
      const now = new Date()
      const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
      const token = newSessionId()
      await ctx.db.insert(invitation).values({
        id: token,
        householdId: ctx.householdId,
        role: input.role,
        email: input.email ?? null,
        invitedByUserId: ctx.userId ?? null,
        createdAt: now,
        expiresAt,
        acceptedAt: null,
      })
      return { token, role: input.role, expiresAt }
    }),

  revoke: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      await ctx.db
        .delete(invitation)
        .where(scopeWhere(ctx.householdId, invitation.householdId, eq(invitation.id, input.id)))
      return { ok: true as const }
    }),

  /** Public: describe an invite for the accept screen (or null if invalid). */
  info: publicProcedure.input(z.object({ token: z.string().max(MAX_TOKEN_LENGTH) })).query(async ({ ctx, input }) => {
    const [inv] = await ctx.db.select().from(invitation).where(eq(invitation.id, input.token))
    if (!inv || inv.acceptedAt !== null || inv.expiresAt.getTime() < Date.now()) return null
    const [hh] = await ctx.db.select().from(household).where(eq(household.id, inv.householdId))
    return { householdName: hh?.displayName ?? 'Household', role: inv.role }
  }),

  /** Public: accept an invite by creating an account, joining the household, and
   *  logging in. */
  accept: publicProcedure
    .input(
      z.object({
        token: z.string().max(MAX_TOKEN_LENGTH),
        username: z.string().min(1).max(MAX_NAME_LENGTH),
        displayName: z.string().min(1).max(MAX_NAME_LENGTH),
        password: z.string().max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = ctx.clientKey ?? 'unknown'
      const nowCheck = Date.now()
      if (!acceptLimiter.check(key, nowCheck).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' })
      }

      const [preview] = await ctx.db.select().from(invitation).where(eq(invitation.id, input.token))
      if (!preview || preview.acceptedAt !== null || preview.expiresAt.getTime() < Date.now()) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation is invalid or has expired.' })
      }
      const weak = validatePassword(input.password)
      if (weak) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: weak })
      }
      // Friendly best-effort check; the unique index on user.username is the real
      // guard against a concurrent same-username race (handled below).
      if (await getUserByUsername(ctx.db, input.username.trim())) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
      }

      const now = new Date()
      const passwordHash = await hashPassword(input.password)
      let result: { userId: string; householdId: string } | null
      try {
        result = await ctx.db.transaction(async (tx) => {
          // Claim the invite atomically: mark it accepted only if it's still
          // pending and unexpired, and act only if this UPDATE was the one that
          // did it. Two concurrent accepts of the same token can't both win —
          // the loser's UPDATE matches no row (accepted_at is no longer null).
          const [claimed] = await tx
            .update(invitation)
            .set({ acceptedAt: now })
            .where(
              and(eq(invitation.id, input.token), isNull(invitation.acceptedAt), gt(invitation.expiresAt, now)),
            )
            .returning()
          if (!claimed) return null
          const userId = await createUserWithMembership(tx, {
            username: normalizeUsername(input.username),
            displayName: input.displayName.trim(),
            email: claimed.email,
            passwordHash,
            householdId: claimed.householdId,
            role: claimed.role,
            invitedAt: claimed.createdAt,
          })
          return { userId, householdId: claimed.householdId }
        })
      } catch (err) {
        if (isUniqueViolation(err)) {
          acceptLimiter.fail(key, nowCheck)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
        throw err
      }
      if (!result) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation is invalid or has expired.' })
      }

      acceptLimiter.reset(key)
      ctx.setSessionCookie?.(await createSession(ctx.db, result.userId, result.householdId))
      return { ok: true as const }
    }),
})
