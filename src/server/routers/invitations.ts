import { z } from 'zod'
import { desc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { household, invitation, membership, user } from '../db/schema'
import { hashPassword } from '../auth/password'
import { createSession, getUserByUsername, newSessionId, normalizeUsername } from '../auth/session'
import { validatePassword } from '../../shared/password-policy'
import { RateLimiter } from '../auth/rateLimit'
import { newId } from '../../shared/ids'

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
    const now = Date.now()
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
      const now = Date.now()
      const token = newSessionId()
      await ctx.db.insert(invitation).values({
        id: token,
        householdId: ctx.householdId,
        role: input.role,
        email: input.email ?? null,
        invitedByUserId: ctx.userId ?? null,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
        acceptedAt: null,
      })
      return { token, role: input.role, expiresAt: now + INVITE_TTL_MS }
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
  info: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const [inv] = await ctx.db.select().from(invitation).where(eq(invitation.id, input.token))
    if (!inv || inv.acceptedAt !== null || inv.expiresAt < Date.now()) return null
    const [hh] = await ctx.db.select().from(household).where(eq(household.id, inv.householdId))
    return { householdName: hh?.displayName ?? 'Household', role: inv.role }
  }),

  /** Public: accept an invite by creating an account, joining the household, and
   *  logging in. */
  accept: publicProcedure
    .input(
      z.object({
        token: z.string(),
        username: z.string().min(1),
        displayName: z.string().min(1),
        password: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = ctx.clientKey ?? 'unknown'
      const nowCheck = Date.now()
      if (!acceptLimiter.check(key, nowCheck).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' })
      }

      const [inv] = await ctx.db.select().from(invitation).where(eq(invitation.id, input.token))
      if (!inv || inv.acceptedAt !== null || inv.expiresAt < Date.now()) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation is invalid or has expired.' })
      }
      const weak = validatePassword(input.password)
      if (weak) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: weak })
      }
      if (await getUserByUsername(ctx.db, input.username.trim())) {
        acceptLimiter.fail(key, nowCheck)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
      }

      const now = Date.now()
      const userId = newId()
      await ctx.db.insert(user).values({
        id: userId,
        username: normalizeUsername(input.username),
        email: inv.email,
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert(membership).values({
        id: newId(),
        userId,
        householdId: inv.householdId,
        role: inv.role,
        invitedAt: inv.createdAt,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.update(invitation).set({ acceptedAt: now }).where(eq(invitation.id, inv.id))

      acceptLimiter.reset(key)
      ctx.setSessionCookie?.(await createSession(ctx.db, userId, inv.householdId))
      return { ok: true as const }
    }),
})
