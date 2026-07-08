import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import QRCode from 'qrcode'
import { router, publicProcedure } from '../trpc/trpc'
import { user } from '../db/schema'
import type { User } from '../db/schema'
import { hashPassword, verifyPassword } from '../auth/password'
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  getOwnerUser,
  getValidSession,
} from '../auth/session'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'
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
import type { DB } from '../db/client'

// Throttle password attempts: 10 per 15 minutes per client, then a 15-minute block.
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
})

/** The owner account, or throw — every auth op targets it (single-user for now). */
async function requireOwner(db: DB): Promise<User> {
  const owner = await getOwnerUser(db)
  if (!owner) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No owner account provisioned' })
  return owner
}

/** True when the request carries a live session belonging to `owner`. */
async function isAuthenticated(db: DB, sessionToken: string | undefined, owner: User): Promise<boolean> {
  const s = await getValidSession(db, sessionToken)
  return s !== null && s.userId === owner.id
}

/** Require the caller to hold a valid session — gates MFA management, which
 *  layers on an already-authenticated session (the HTTP gate enforces it too). */
async function assertAuthenticated(db: DB, sessionToken: string | undefined, owner: User): Promise<void> {
  if (!(await isAuthenticated(db, sessionToken, owner))) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
}

export const authRouter = router({
  /** Whether a password is configured, whether MFA is on, and whether this
   *  request is authenticated. */
  status: publicProcedure.query(async ({ ctx }) => {
    const owner = await requireOwner(ctx.db)
    const hasPassword = owner.passwordHash !== null
    return {
      passwordSet: hasPassword,
      mfaEnabled: owner.mfaEnabledAt !== null,
      authenticated: hasPassword ? await isAuthenticated(ctx.db, ctx.sessionToken, owner) : true,
    }
  }),

  login: publicProcedure
    .input(z.object({ password: z.string(), code: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await requireOwner(ctx.db)
      const hash = owner.passwordHash
      if (hash === null) return { ok: true as const } // no password required

      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      const limit = loginLimiter.check(key, now)
      if (!limit.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).`,
        })
      }

      if (!verifyPassword(input.password, hash)) {
        loginLimiter.fail(key, now)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' })
      }

      // Password OK. If MFA is enabled, require a valid TOTP or recovery code
      // before issuing a session.
      if (owner.mfaEnabledAt && owner.mfaSecret) {
        if (!input.code) {
          // Not a failed attempt — the client just needs to collect the code.
          return { ok: false as const, mfaRequired: true as const }
        }
        const codeOk = await verifyMfaCode(ctx.db, owner, input.code)
        if (!codeOk) {
          loginLimiter.fail(key, now)
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      loginLimiter.reset(key)
      const sessionId = await createSession(ctx.db, owner.id, DEFAULT_HOUSEHOLD_ID)
      ctx.setSessionCookie?.(sessionId)
      return { ok: true as const }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await deleteSession(ctx.db, ctx.sessionToken)
    ctx.setSessionCookie?.(null)
    return { ok: true as const }
  }),

  /** Set or change the password. Requires the current password if one is set;
   *  revokes existing sessions and keeps the setter logged in under a fresh one. */
  setPassword: publicProcedure
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await requireOwner(ctx.db)
      const hash = owner.passwordHash
      if (hash !== null && !verifyPassword(input.currentPassword ?? '', hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const newHash = hashPassword(input.newPassword)
      await ctx.db.update(user).set({ passwordHash: newHash, updatedAt: Date.now() }).where(eq(user.id, owner.id))
      // Invalidate every existing session, then issue a fresh one for the setter.
      await deleteUserSessions(ctx.db, owner.id)
      const sessionId = await createSession(ctx.db, owner.id, DEFAULT_HOUSEHOLD_ID)
      ctx.setSessionCookie?.(sessionId)
      return { ok: true as const }
    }),

  /** Remove the password (returns the instance to no-auth). Also clears MFA,
   *  which is meaningless without a password, and revokes all sessions. */
  clearPassword: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await requireOwner(ctx.db)
      const hash = owner.passwordHash
      if (hash === null) return { ok: true as const }
      if (!verifyPassword(input.currentPassword, hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(user)
        .set({ passwordHash: null, mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(user.id, owner.id))
      await deleteUserSessions(ctx.db, owner.id)
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Begin MFA enrolment: generate a fresh secret (pending until confirmed) and
   *  return the scannable QR + manual-entry secret. Requires an authenticated
   *  session and an existing password. */
  enrollMfa: publicProcedure.mutation(async ({ ctx }) => {
    const owner = await requireOwner(ctx.db)
    if (owner.passwordHash === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set a password before enabling two-factor authentication.' })
    }
    await assertAuthenticated(ctx.db, ctx.sessionToken, owner)

    const secret = generateTotpSecret()
    // Store as pending (secret set, not yet enabled). A re-enrol overwrites any
    // previous pending secret; enabled MFA is untouched until confirmMfa runs.
    await ctx.db.update(user).set({ mfaSecret: secret, mfaEnabledAt: null, updatedAt: Date.now() }).where(eq(user.id, owner.id))

    const account = owner.displayName || 'Household'
    const otpauthUrl = buildOtpauthUrl(secret, account)
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 })
    return { secret, otpauthUrl, qrSvg }
  }),

  /** Confirm enrolment with a code from the authenticator. On success MFA turns
   *  on and one-time recovery codes are returned (shown once). */
  confirmMfa: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await requireOwner(ctx.db)
      if (owner.passwordHash === null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set.' })
      await assertAuthenticated(ctx.db, ctx.sessionToken, owner)
      if (!owner.mfaSecret) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start enrolment first.' })
      }
      if (!verifyTotp(owner.mfaSecret, input.code)) {
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
        .where(eq(user.id, owner.id))
      return { ok: true as const, recoveryCodes }
    }),

  /** Turn MFA off. Requires the current password (a sensitive downgrade). */
  disableMfa: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await requireOwner(ctx.db)
      if (owner.passwordHash === null) return { ok: true as const }
      await assertAuthenticated(ctx.db, ctx.sessionToken, owner)
      if (!verifyPassword(input.currentPassword, owner.passwordHash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(user)
        .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(user.id, owner.id))
      return { ok: true as const }
    }),
})

/** Verify a login MFA code: first as a TOTP, then as a single-use recovery code
 *  (which is consumed on success). Returns whether it was accepted. */
async function verifyMfaCode(db: DB, owner: User, code: string): Promise<boolean> {
  if (owner.mfaSecret && verifyTotp(owner.mfaSecret, code)) return true
  if (!owner.mfaRecoveryCodes) return false
  const hashes = JSON.parse(owner.mfaRecoveryCodes) as string[]
  const remaining = consumeRecoveryCode(code, hashes)
  if (remaining === null) return false
  await db
    .update(user)
    .set({ mfaRecoveryCodes: JSON.stringify(remaining), updatedAt: Date.now() })
    .where(eq(user.id, owner.id))
  return true
}
