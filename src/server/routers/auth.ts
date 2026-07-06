import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import QRCode from 'qrcode'
import { router, publicProcedure } from '../trpc/trpc'
import { household } from '../db/schema'
import { deriveSessionToken, hashPassword, isValidSessionToken, verifyPassword } from '../auth/password'
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

const HOUSEHOLD_ID = 'household'

// Throttle password attempts: 10 per 15 minutes per client, then a 15-minute block.
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
})

async function getHousehold(db: DB) {
  const [hh] = await db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
  return hh ?? null
}

/** Require the caller to hold a valid session for the current password. Used to
 *  gate MFA management, which layers on top of an already-authenticated session
 *  (the HTTP gate enforces this too; this makes the procedures safe on their own). */
function assertAuthenticated(sessionToken: string | undefined, passwordHash: string): void {
  if (!isValidSessionToken(sessionToken, passwordHash)) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
}

export const authRouter = router({
  /** Whether a password is configured, whether MFA is on, and whether this
   *  request is authenticated. */
  status: publicProcedure.query(async ({ ctx }) => {
    const hh = await getHousehold(ctx.db)
    const hash = hh?.passwordHash ?? null
    return {
      passwordSet: hash !== null,
      mfaEnabled: (hh?.mfaEnabledAt ?? null) !== null,
      authenticated: hash === null ? true : isValidSessionToken(ctx.sessionToken, hash),
    }
  }),

  login: publicProcedure
    .input(z.object({ password: z.string(), code: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const hh = await getHousehold(ctx.db)
      const hash = hh?.passwordHash ?? null
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
      if (hh?.mfaEnabledAt && hh.mfaSecret) {
        if (!input.code) {
          // Not a failed attempt — the client just needs to collect the code.
          return { ok: false as const, mfaRequired: true as const }
        }
        const codeOk = await verifyMfaCode(ctx.db, hh.mfaSecret, hh.mfaRecoveryCodes, input.code)
        if (!codeOk) {
          loginLimiter.fail(key, now)
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      loginLimiter.reset(key)
      ctx.setSessionCookie?.(deriveSessionToken(hash))
      return { ok: true as const }
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.setSessionCookie?.(null)
    return { ok: true as const }
  }),

  /** Set or change the shared password. Requires the current password if one is set. */
  setPassword: publicProcedure
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hh = await getHousehold(ctx.db)
      const hash = hh?.passwordHash ?? null
      if (hash !== null && !verifyPassword(input.currentPassword ?? '', hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const newHash = hashPassword(input.newPassword)
      await ctx.db
        .update(household)
        .set({ passwordHash: newHash, updatedAt: Date.now() })
        .where(eq(household.id, HOUSEHOLD_ID))
      // Keep the setter logged in under the new hash.
      ctx.setSessionCookie?.(deriveSessionToken(newHash))
      return { ok: true as const }
    }),

  /** Remove the shared password (returns the instance to no-auth). Also clears
   *  MFA, which is meaningless without a password. */
  clearPassword: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hh = await getHousehold(ctx.db)
      const hash = hh?.passwordHash ?? null
      if (hash === null) return { ok: true as const }
      if (!verifyPassword(input.currentPassword, hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(household)
        .set({ passwordHash: null, mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(household.id, HOUSEHOLD_ID))
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Begin MFA enrolment: generate a fresh secret (pending until confirmed) and
   *  return the scannable QR + manual-entry secret. Requires an authenticated
   *  session and an existing password. */
  enrollMfa: publicProcedure.mutation(async ({ ctx }) => {
    const hh = await getHousehold(ctx.db)
    const hash = hh?.passwordHash ?? null
    if (hash === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set a password before enabling two-factor authentication.' })
    }
    assertAuthenticated(ctx.sessionToken, hash)

    const secret = generateTotpSecret()
    // Store as pending (secret set, not yet enabled). A re-enrol overwrites any
    // previous pending secret; enabled MFA is untouched until confirmMfa runs.
    await ctx.db
      .update(household)
      .set({ mfaSecret: secret, mfaEnabledAt: null, updatedAt: Date.now() })
      .where(eq(household.id, HOUSEHOLD_ID))

    const account = hh?.displayName || 'Household'
    const otpauthUrl = buildOtpauthUrl(secret, account)
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 })
    return { secret, otpauthUrl, qrSvg }
  }),

  /** Confirm enrolment with a code from the authenticator. On success MFA turns
   *  on and one-time recovery codes are returned (shown once). */
  confirmMfa: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hh = await getHousehold(ctx.db)
      const hash = hh?.passwordHash ?? null
      if (hash === null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set.' })
      assertAuthenticated(ctx.sessionToken, hash)
      if (!hh?.mfaSecret) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start enrolment first.' })
      }
      if (!verifyTotp(hh.mfaSecret, input.code)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect code — check your authenticator and try again.' })
      }

      const recoveryCodes = generateRecoveryCodes(10)
      await ctx.db
        .update(household)
        .set({
          mfaEnabledAt: Date.now(),
          mfaRecoveryCodes: JSON.stringify(hashRecoveryCodes(recoveryCodes)),
          updatedAt: Date.now(),
        })
        .where(eq(household.id, HOUSEHOLD_ID))
      return { ok: true as const, recoveryCodes }
    }),

  /** Turn MFA off. Requires the current password (a sensitive downgrade). */
  disableMfa: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hh = await getHousehold(ctx.db)
      const hash = hh?.passwordHash ?? null
      if (hash === null) return { ok: true as const }
      assertAuthenticated(ctx.sessionToken, hash)
      if (!verifyPassword(input.currentPassword, hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(household)
        .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: Date.now() })
        .where(eq(household.id, HOUSEHOLD_ID))
      return { ok: true as const }
    }),
})

/** Verify a login MFA code: first as a TOTP, then as a single-use recovery code
 *  (which is consumed on success). Returns whether it was accepted. */
async function verifyMfaCode(
  db: DB,
  secret: string,
  recoveryJson: string | null,
  code: string,
): Promise<boolean> {
  if (verifyTotp(secret, code)) return true
  if (!recoveryJson) return false
  const hashes = JSON.parse(recoveryJson) as string[]
  const remaining = consumeRecoveryCode(code, hashes)
  if (remaining === null) return false
  await db
    .update(household)
    .set({ mfaRecoveryCodes: JSON.stringify(remaining), updatedAt: Date.now() })
    .where(eq(household.id, HOUSEHOLD_ID))
  return true
}
