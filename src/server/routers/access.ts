import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere, type Role } from '../trpc/tenant'
import { recordSecurityEvent } from '../trpc/audit'
import { membership, user } from '../db/schema'
import type { DB } from '../db/client'
import { hashPassword } from '../auth/password'
import { acceptedMembership, deleteUserSessions } from '../auth/session'
import { validatePassword } from '../../shared/password-policy'

const assignableRole = z.enum(['owner', 'admin', 'member', 'viewer'])

const grantFor = acceptedMembership

/** How many accepted owners the household has — the last-owner guard. */
async function ownerCount(db: DB, householdId: string): Promise<number> {
  const owners = await db
    .select()
    .from(membership)
    .where(scopeWhere(householdId, membership.householdId, eq(membership.role, 'owner')))
  return owners.filter((g) => g.acceptedAt !== null).length
}

/** A readable label for the member an access change targets, captured at event
 *  time so the audit trail stays legible after a later rename. */
async function memberLabel(db: DB, userId: string): Promise<string> {
  const [u] = await db.select({ displayName: user.displayName, username: user.username }).from(user).where(eq(user.id, userId))
  return u?.displayName ?? u?.username ?? userId
}

/** Managing a target with an owner/admin role is owner-only; managing a
 *  member/viewer needs admin. Prevents an admin from touching a peer or owner. */
function assertCanManage(actorRole: string | undefined, targetRole: string): void {
  const elevated = targetRole === 'owner' || targetRole === 'admin'
  assertRole(actorRole, elevated ? 'owner' : 'admin')
}

export const accessRouter = router({
  /** Everyone with accepted access to the active household. Admin+ only. */
  list: publicProcedure.query(async ({ ctx }) => {
    assertRole(ctx.role, 'admin')
    const grants = (
      await ctx.db
        .select()
        .from(membership)
        .where(scopeWhere(ctx.householdId, membership.householdId))
    ).filter((g) => g.acceptedAt !== null)

    const userIds = grants.map((g) => g.userId)
    const users = userIds.length
      ? await ctx.db.select().from(user).where(inArray(user.id, userIds))
      : []
    const byId = new Map(users.map((u) => [u.id, u]))

    return grants
      .map((g) => {
        const u = byId.get(g.userId)
        return {
          userId: g.userId,
          username: u?.username ?? '—',
          displayName: u?.displayName ?? '—',
          email: u?.email ?? null,
          role: g.role as Role,
          mfaEnabled: (u?.mfaEnabledAt ?? null) !== null,
          isYou: g.userId === ctx.userId,
          acceptedAt: g.acceptedAt,
        }
      })
      .sort((a, b) => (a.acceptedAt?.getTime() ?? 0) - (b.acceptedAt?.getTime() ?? 0))
  }),

  /** Change a member's role. Owner-only for anything touching owner/admin;
   *  can't change your own role; the last owner can't be demoted. */
  setRole: publicProcedure
    .input(z.object({ userId: z.string(), role: assignableRole }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can’t change your own role.' })
      }
      const target = await grantFor(ctx.db, ctx.householdId, input.userId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such member.' })

      // Authority over both the current and the new role.
      assertCanManage(ctx.role, target.role)
      if (input.role === 'owner' || input.role === 'admin') assertRole(ctx.role, 'owner')

      if (target.role === 'owner' && input.role !== 'owner' && (await ownerCount(ctx.db, ctx.householdId)) <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A household must keep at least one owner.' })
      }

      await ctx.db
        .update(membership)
        .set({ role: input.role, updatedAt: new Date() })
        .where(scopeWhere(ctx.householdId, membership.householdId, eq(membership.userId, input.userId)))
      recordSecurityEvent(ctx, {
        entityType: 'membership',
        entityId: input.userId,
        action: 'role_changed',
        details: { member: await memberLabel(ctx.db, input.userId), from: target.role, to: input.role },
      })
      return { ok: true as const }
    }),

  /** Revoke a member's access to the active household and end their sessions.
   *  The user account itself is left intact (they may belong elsewhere). */
  remove: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can’t remove your own access.' })
      }
      const target = await grantFor(ctx.db, ctx.householdId, input.userId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such member.' })
      assertCanManage(ctx.role, target.role)
      if (target.role === 'owner' && (await ownerCount(ctx.db, ctx.householdId)) <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A household must keep at least one owner.' })
      }

      const label = await memberLabel(ctx.db, input.userId)
      await ctx.db
        .delete(membership)
        .where(scopeWhere(ctx.householdId, membership.householdId, eq(membership.userId, input.userId)))
      // Their sessions (which may point at this household) are now invalid.
      await deleteUserSessions(ctx.db, input.userId)
      recordSecurityEvent(ctx, {
        entityType: 'membership',
        entityId: input.userId,
        action: 'access_removed',
        details: { member: label, role: target.role },
      })
      return { ok: true as const }
    }),

  /** Set a new password for a member who's locked out (no email-based reset in
   *  self-host). Owner-only for admins/owners; ends the member's sessions.
   *
   *  `clearMfa` also drops their two-factor enrolment, for the lockout a password
   *  alone doesn't fix: a lost phone with the recovery codes gone (issue #51).
   *  It's opt-in rather than implied by every reset — silently stripping a member's
   *  second factor is a security downgrade they never agreed to, and one they'd
   *  only discover the next time they signed in without being asked for a code. */
  resetPassword: publicProcedure
    .input(z.object({ userId: z.string(), newPassword: z.string(), clearMfa: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Change your own password from account settings.',
        })
      }
      const target = await grantFor(ctx.db, ctx.householdId, input.userId)
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such member.' })
      assertCanManage(ctx.role, target.role)

      // A reset lets the resetter choose (and thus learn) the new password. That's
      // fine for someone who only belongs here, but if they're also a member/owner
      // of another household it would hand this admin the keys to that household.
      // Refuse — a multi-household user must reset their own password.
      const theirMemberships = (
        await ctx.db.select().from(membership).where(eq(membership.userId, input.userId))
      ).filter((g) => g.acceptedAt !== null)
      if (theirMemberships.length > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This person belongs to other households, so they must reset their own password.',
        })
      }

      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      // Only a real turn-off counts: `clearMfa` on a member who never had it is a
      // no-op, and shouldn't leave an "MFA disabled" entry in the trail.
      const [targetUser] = await ctx.db.select().from(user).where(eq(user.id, input.userId))
      const mfaCleared = Boolean(input.clearMfa && targetUser?.mfaEnabledAt)

      await ctx.db
        .update(user)
        .set({
          passwordHash: await hashPassword(input.newPassword),
          ...(input.clearMfa ? { mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, mfaLastStep: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.userId))
      await deleteUserSessions(ctx.db, input.userId)
      // Record the reset, never the new password (issue #49).
      const member = await memberLabel(ctx.db, input.userId)
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: input.userId,
        action: 'password_reset',
        details: { member, mfaCleared },
      })
      // Losing a second factor is its own security event, not a footnote to the
      // password reset — give it the entry (and the badge) it has everywhere else.
      if (mfaCleared) {
        recordSecurityEvent(ctx, {
          entityType: 'user',
          entityId: input.userId,
          action: 'mfa_disabled',
          details: { member, via: 'admin_reset' },
        })
      }
      return { ok: true as const }
    }),
})
