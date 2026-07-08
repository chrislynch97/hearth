import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import QRCode from 'qrcode'
import { router, publicProcedure } from '../trpc/trpc'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
import { membership, user } from '../db/schema'
import type { User } from '../db/schema'
import { getInstanceSettings, setAllowOpenRegistration } from '../db/instanceSettings'
import { provisionHousehold } from '../db/seed'
import { newId } from '../../shared/ids'
import { hashPassword, verifyPassword } from '../auth/password'
import {
  createSession,
  defaultHouseholdFor,
  deleteSession,
  deleteUserSessions,
  getOwnerUser,
  getUser,
  getUserByUsername,
  getValidSession,
} from '../auth/session'
import {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotp,
} from '../auth/totp'
import { validatePassword } from '../../shared/password-policy'
import { RateLimiter } from '../auth/rateLimit'
import type { Context } from '../trpc/context'
import type { DB } from '../db/client'

// Throttle password attempts: 10 per 15 minutes per client, then a 15-minute block.
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
})

/** The user this request acts as: the session's user, or — on an open
 *  (password-less) instance — the owner. Null when locked with no valid session. */
async function currentUser(ctx: Context): Promise<User | null> {
  const s = await getValidSession(ctx.db, ctx.sessionToken)
  if (s) return getUser(ctx.db, s.userId)
  const owner = await getOwnerUser(ctx.db)
  return owner && owner.passwordHash === null ? owner : null
}

async function requireCurrentUser(ctx: Context): Promise<User> {
  const u = await currentUser(ctx)
  if (!u) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  return u
}

/** Instance-wide settings belong to the self-host operator, i.e. an owner of the
 *  PRIMARY household — not just any household owner. Without this, a
 *  self-registered user (owner of their own new household) could flip
 *  instance-level switches like open registration. */
async function assertInstanceOwner(ctx: Context): Promise<void> {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  const [grant] = await ctx.db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.userId, ctx.userId),
        eq(membership.householdId, DEFAULT_HOUSEHOLD_ID),
        eq(membership.role, 'owner'),
      ),
    )
  if (!grant || grant.acceptedAt === null) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the instance owner can change this.' })
  }
}

export const authRouter = router({
  /** Whether the instance requires login, whether the current user has MFA on,
   *  whether this request is authenticated, and who it is. */
  status: publicProcedure.query(async ({ ctx }) => {
    const owner = await getOwnerUser(ctx.db)
    const locked = (owner?.passwordHash ?? null) !== null
    const s = await getValidSession(ctx.db, ctx.sessionToken)
    const cur = s ? await getUser(ctx.db, s.userId) : locked ? null : owner
    return {
      passwordSet: locked,
      authenticated: locked ? s !== null : true,
      mfaEnabled: (cur?.mfaEnabledAt ?? null) !== null,
      user: cur ? { id: cur.id, username: cur.username, displayName: cur.displayName } : null,
    }
  }),

  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string(), code: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await getOwnerUser(ctx.db)
      if ((owner?.passwordHash ?? null) === null) return { ok: true as const } // open instance

      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      const limit = loginLimiter.check(key, now)
      if (!limit.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).`,
        })
      }

      const u = await getUserByUsername(ctx.db, input.username.trim())
      if (!u || u.passwordHash === null || !verifyPassword(input.password, u.passwordHash)) {
        loginLimiter.fail(key, now)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect username or password' })
      }

      if (u.mfaEnabledAt && u.mfaSecret) {
        if (!input.code) return { ok: false as const, mfaRequired: true as const }
        if (!(await verifyMfaCode(ctx.db, u, input.code))) {
          loginLimiter.fail(key, now)
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      loginLimiter.reset(key)
      const householdId = await defaultHouseholdFor(ctx.db, u.id)
      ctx.setSessionCookie?.(await createSession(ctx.db, u.id, householdId))
      return { ok: true as const }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await deleteSession(ctx.db, ctx.sessionToken)
    ctx.setSessionCookie?.(null)
    return { ok: true as const }
  }),

  /** Whether anyone may self-register a new household. Public — the login screen
   *  reads it to decide whether to offer "create an account". */
  registrationOpen: publicProcedure.query(async ({ ctx }) => {
    return await getInstanceSettings(ctx.db)
  }),

  /** Turn open registration on/off. Instance-wide, so restricted to the instance
   *  owner (an owner of the primary household) — not any household owner. */
  setRegistrationOpen: publicProcedure
    .input(z.object({ open: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertInstanceOwner(ctx)
      await setAllowOpenRegistration(ctx.db, input.open)
      return { allowOpenRegistration: input.open }
    }),

  /** Self-register: create an account and a brand-new household you own, then log
   *  in. Only when open registration is enabled. */
  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        displayName: z.string().min(1),
        password: z.string(),
        householdName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { allowOpenRegistration } = await getInstanceSettings(ctx.db)
      if (!allowOpenRegistration) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration is closed on this instance.' })
      }
      const weak = validatePassword(input.password)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })
      if (await getUserByUsername(ctx.db, input.username.trim())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
      }

      const now = Date.now()
      const householdId = await provisionHousehold(ctx.db, { displayName: input.householdName })
      const userId = newId()
      await ctx.db.insert(user).values({
        id: userId,
        username: input.username.trim(),
        email: null,
        displayName: input.displayName.trim(),
        passwordHash: hashPassword(input.password),
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert(membership).values({
        id: newId(),
        userId,
        householdId,
        role: 'owner',
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      ctx.setSessionCookie?.(await createSession(ctx.db, userId, householdId))
      return { ok: true as const }
    }),

  /** Set or change the current user's password. Requires the current password
   *  if one is set; revokes existing sessions and keeps the setter logged in. */
  setPassword: publicProcedure
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash !== null && !verifyPassword(input.currentPassword ?? '', me.passwordHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const newHash = hashPassword(input.newPassword)
      await ctx.db.update(user).set({ passwordHash: newHash, updatedAt: Date.now() }).where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      const householdId = await defaultHouseholdFor(ctx.db, me.id)
      ctx.setSessionCookie?.(await createSession(ctx.db, me.id, householdId))
      return { ok: true as const }
    }),

  /** Remove the password, returning the instance to no-auth. Owner-only, and only
   *  when they're the sole account (can't reopen past other people's logins). */
  clearPassword: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash === null) return { ok: true as const }
      if (!verifyPassword(input.currentPassword, me.passwordHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const owner = await getOwnerUser(ctx.db)
      if (me.id !== owner?.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the owner can remove the password.' })
      }
      const users = await ctx.db.select().from(user)
      if (users.length > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Remove the other accounts before turning the password off.',
        })
      }
      await ctx.db
        .update(user)
        .set({ passwordHash: null, mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Begin MFA enrolment for the current user: a fresh pending secret + QR. */
  enrollMfa: publicProcedure.mutation(async ({ ctx }) => {
    const me = await requireCurrentUser(ctx)
    if (me.passwordHash === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set a password before enabling two-factor authentication.' })
    }
    const secret = generateTotpSecret()
    await ctx.db.update(user).set({ mfaSecret: secret, mfaEnabledAt: null, updatedAt: Date.now() }).where(eq(user.id, me.id))
    const otpauthUrl = buildOtpauthUrl(secret, me.displayName || me.username)
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 })
    return { secret, otpauthUrl, qrSvg }
  }),

  /** Confirm enrolment with a code; turns MFA on and returns recovery codes. */
  confirmMfa: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash === null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set.' })
      if (!me.mfaSecret) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start enrolment first.' })
      if (!verifyTotp(me.mfaSecret, input.code)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect code — check your authenticator and try again.' })
      }
      const recoveryCodes = generateRecoveryCodes(10)
      await ctx.db
        .update(user)
        .set({
          mfaEnabledAt: Date.now(),
          mfaRecoveryCodes: JSON.stringify(hashRecoveryCodes(recoveryCodes)),
          updatedAt: Date.now(),
        })
        .where(eq(user.id, me.id))
      return { ok: true as const, recoveryCodes }
    }),

  /** Turn MFA off. Requires the current password (a sensitive downgrade). */
  disableMfa: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash === null) return { ok: true as const }
      if (!verifyPassword(input.currentPassword, me.passwordHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(user)
        .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(user.id, me.id))
      return { ok: true as const }
    }),
})

/** Verify a login MFA code: first as a TOTP, then as a single-use recovery code
 *  (which is consumed on success). Returns whether it was accepted. */
async function verifyMfaCode(db: DB, u: User, code: string): Promise<boolean> {
  if (u.mfaSecret && verifyTotp(u.mfaSecret, code)) return true
  if (!u.mfaRecoveryCodes) return false
  const hashes = JSON.parse(u.mfaRecoveryCodes) as string[]
  const remaining = consumeRecoveryCode(code, hashes)
  if (remaining === null) return false
  await db
    .update(user)
    .set({ mfaRecoveryCodes: JSON.stringify(remaining), updatedAt: Date.now() })
    .where(eq(user.id, u.id))
  return true
}
