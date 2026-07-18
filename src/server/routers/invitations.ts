import { z } from 'zod'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { recordSecurityEvent } from '../trpc/audit'
import { household, invitation, member } from '../db/schema'
import { isUniqueViolation } from '../db/errors'
import { hashPassword } from '../auth/password'
import { createSession, createUserWithMembership, getUserByUsername, hashToken, newSessionId, normalizeUsername } from '../auth/session'
import { newId } from '../../shared/ids'
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
      .select({
        id: invitation.id,
        role: invitation.role,
        email: invitation.email,
        memberId: invitation.memberId,
        memberName: member.displayName,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .leftJoin(member, eq(member.id, invitation.memberId))
      .where(scopeWhere(ctx.householdId, invitation.householdId, isNull(invitation.acceptedAt)))
      .orderBy(desc(invitation.createdAt))
    // memberName is null when no member is tied, or when a tied member was since
    // removed (the FK nulls member_id, so memberId reads null too).
    return rows.filter((r) => r.expiresAt > now)
  }),

  /** Create an invite. Admins can invite member/viewer; owners can also invite
   *  admins. Returns the token — the client builds the shareable link from it. */
  create: publicProcedure
    .input(z.object({ role: inviteRole, email: z.string().email().nullable().optional(), memberId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, input.role === 'admin' ? 'owner' : 'admin')
      // A tied member must be an unlinked person in this household. Reject a bad
      // selection outright rather than minting an invite that can't link.
      if (input.memberId) {
        const [target] = await ctx.db
          .select()
          .from(member)
          .where(scopeWhere(ctx.householdId, member.householdId, eq(member.id, input.memberId)))
        if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })
        if (target.kind !== 'person' || target.archivedAt !== null) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That member cannot be linked to an invite.' })
        }
        if (target.userId !== null) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That member is already linked to an account.' })
        }
      }
      const now = new Date()
      const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
      const token = newSessionId()
      const id = newId()
      await ctx.db.insert(invitation).values({
        id,
        tokenHash: hashToken(token),
        householdId: ctx.householdId,
        role: input.role,
        email: input.email ?? null,
        memberId: input.memberId ?? null,
        invitedByUserId: ctx.userId ?? null,
        createdAt: now,
        expiresAt,
        acceptedAt: null,
      })
      // Record the invite, never the token (issue #49).
      recordSecurityEvent(ctx, {
        entityType: 'invitation',
        entityId: id,
        action: 'invite_created',
        details: { role: input.role, email: input.email ?? null, memberId: input.memberId ?? null },
      })
      return { token, role: input.role, expiresAt }
    }),

  revoke: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      // Read the invite first so the audit entry can describe what was revoked.
      const [inv] = await ctx.db
        .select()
        .from(invitation)
        .where(scopeWhere(ctx.householdId, invitation.householdId, eq(invitation.id, input.id)))
      await ctx.db
        .delete(invitation)
        .where(scopeWhere(ctx.householdId, invitation.householdId, eq(invitation.id, input.id)))
      if (inv) {
        recordSecurityEvent(ctx, {
          entityType: 'invitation',
          entityId: input.id,
          action: 'invite_revoked',
          details: { role: inv.role, email: inv.email },
        })
      }
      return { ok: true as const }
    }),

  /** Public: describe an invite for the accept screen (or null if invalid). */
  info: publicProcedure.input(z.object({ token: z.string().max(MAX_TOKEN_LENGTH) })).query(async ({ ctx, input }) => {
    const [inv] = await ctx.db.select().from(invitation).where(eq(invitation.tokenHash, hashToken(input.token)))
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

      const tokenHash = hashToken(input.token)
      const [preview] = await ctx.db.select().from(invitation).where(eq(invitation.tokenHash, tokenHash))
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
      let result: { userId: string; householdId: string; role: string; linkedMemberId: string | null } | null
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
              and(eq(invitation.tokenHash, tokenHash), isNull(invitation.acceptedAt), gt(invitation.expiresAt, now)),
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
          // Auto-link the tied member, if any. The isNull guard means a member
          // linked to someone else in the meantime is left alone (no row matches),
          // and a deleted member already nulled member_id — both fall back to
          // no-link rather than failing the acceptance.
          let linkedMemberId: string | null = null
          if (claimed.memberId) {
            const [linked] = await tx
              .update(member)
              .set({ userId, updatedAt: now })
              .where(and(eq(member.id, claimed.memberId), eq(member.householdId, claimed.householdId), isNull(member.userId)))
              .returning({ id: member.id })
            linkedMemberId = linked?.id ?? null
          }
          return { userId, householdId: claimed.householdId, role: claimed.role, linkedMemberId }
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
      // The new member is both actor and subject; the request context has no
      // identity yet (the session is created below), so record with explicit
      // household + actor so the entry lands in the joined household's trail.
      recordSecurityEvent(ctx, {
        entityType: 'membership',
        entityId: result.userId,
        action: 'invite_accepted',
        details: { member: input.displayName.trim(), role: result.role, linkedMemberId: result.linkedMemberId },
        householdId: result.householdId,
        actorUserId: result.userId,
      })
      ctx.setSessionCookie?.(await createSession(ctx.db, result.userId, result.householdId))
      return { ok: true as const }
    }),
})
