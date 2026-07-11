import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import QRCode from 'qrcode'
import { router, publicProcedure } from '../trpc/trpc'
import { user } from '../db/schema'
import type { User } from '../db/schema'
import { getInstanceSettings, setAllowOpenRegistration } from '../db/instanceSettings'
import { provisionHousehold } from '../db/seed'
import { isUniqueViolation } from '../db/errors'
import { hashPassword, verifyPassword, verifyPasswordDummy } from '../auth/password'
import {
  assertInstanceOwner,
  createSession,
  createUserWithMembership,
  defaultHouseholdFor,
  deleteSession,
  deleteUserSessions,
  getOwnerUser,
  getUser,
  getUserByUsername,
  getValidSession,
  isInstanceLocked,
  normalizeUsername,
  syncAuthRequired,
} from '../auth/session'
import {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  matchTotpStep,
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

// Second, account-scoped throttle keyed on the target username, to catch a
// *distributed* brute-force of one account (an attacker rotating source IPs to
// stay under the per-IP cap). The cap is deliberately higher than the per-IP cap
// so a single client — already limited to 10 — can never trip it, which stops an
// attacker from locking a known victim out of their own account (griefing).
const loginAccountLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 50,
  blockMs: 15 * 60 * 1000,
})

// Throttle self-registration so an open instance can't be spammed into creating
// unbounded accounts + households: 10 per hour per client, then a 1-hour block.
const registerLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 60 * 60 * 1000,
})

/** The user this request acts as: the session's user, or — on an open
 *  (password-less) instance — the owner. Null when locked with no valid session. */
async function currentUser(ctx: Context): Promise<User | null> {
  const s = await getValidSession(ctx.db, ctx.sessionToken)
  if (s) return getUser(ctx.db, s.userId)
  if (await isInstanceLocked(ctx.db)) return null
  return getOwnerUser(ctx.db) // open instance: act as the owner
}

async function requireCurrentUser(ctx: Context): Promise<User> {
  const u = await currentUser(ctx)
  if (!u) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  return u
}

export const authRouter = router({
  /** Whether the instance requires login, whether the current user has MFA on,
   *  whether this request is authenticated, and who it is. */
  status: publicProcedure.query(async ({ ctx }) => {
    const locked = await isInstanceLocked(ctx.db)
    const owner = await getOwnerUser(ctx.db)
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
      if (!(await isInstanceLocked(ctx.db))) return { ok: true as const } // open instance

      const key = ctx.clientKey ?? 'unknown'
      const acctKey = normalizeUsername(input.username)
      const now = Date.now()
      const ipLimit = loginLimiter.check(key, now)
      const acctLimit = loginAccountLimiter.check(acctKey, now)
      if (!ipLimit.allowed || !acctLimit.allowed) {
        const retryAfterMs = Math.max(ipLimit.retryAfterMs, acctLimit.retryAfterMs)
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
        })
      }

      // Record a failed attempt against both the per-IP and per-account limiters.
      const recordFail = () => {
        loginLimiter.fail(key, now)
        loginAccountLimiter.fail(acctKey, now)
      }

      const u = await getUserByUsername(ctx.db, input.username.trim())
      // Always spend scrypt time: verify against the stored hash when there is
      // one, otherwise burn the same time against a dummy. A short-circuit here
      // would leak whether the username exists via the response timing.
      const ok =
        u && u.passwordHash !== null
          ? await verifyPassword(input.password, u.passwordHash)
          : await verifyPasswordDummy(input.password)
      if (!u || !ok) {
        recordFail()
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect username or password' })
      }

      if (u.mfaEnabledAt && u.mfaSecret) {
        if (!input.code) return { ok: false as const, mfaRequired: true as const }
        if (!(await verifyMfaCode(ctx.db, u, input.code))) {
          recordFail()
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      loginLimiter.reset(key)
      loginAccountLimiter.reset(acctKey)
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
      await assertInstanceOwner(ctx.db, ctx.userId)
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

      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      if (!registerLimiter.check(key, now).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many sign-ups from here. Try again later.' })
      }

      const weak = validatePassword(input.password)
      if (weak) {
        registerLimiter.fail(key, now)
        throw new TRPCError({ code: 'BAD_REQUEST', message: weak })
      }
      // Count the "taken" path against the limiter too, otherwise it's an
      // unthrottled username-enumeration oracle on an open-registration instance.
      // This is a friendly best-effort check; the unique index on user.username is
      // the real guard against a concurrent same-username race (handled below).
      if (await getUserByUsername(ctx.db, input.username.trim())) {
        registerLimiter.fail(key, now)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
      }

      const passwordHash = await hashPassword(input.password)
      let householdId: string
      let userId: string
      try {
        // The household and the owning user must commit together: a failure
        // between them would otherwise leave an orphaned household (or a user with
        // no membership). Under Postgres's real concurrency two sign-ups can also
        // pass the check above at once — the unique index makes the loser's insert
        // throw here, which we turn back into the friendly "taken" message.
        ;({ householdId, userId } = await ctx.db.transaction(async (tx) => {
          const hid = await provisionHousehold(tx, { displayName: input.householdName })
          const uid = await createUserWithMembership(tx, {
            username: normalizeUsername(input.username),
            displayName: input.displayName.trim(),
            email: null,
            passwordHash,
            householdId: hid,
            role: 'owner',
          })
          return { householdId: hid, userId: uid }
        }))
      } catch (err) {
        if (isUniqueViolation(err)) {
          registerLimiter.fail(key, now)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
        throw err
      }

      registerLimiter.fail(key, now) // count this sign-up toward the per-client cap
      ctx.setSessionCookie?.(await createSession(ctx.db, userId, householdId))
      return { ok: true as const }
    }),

  /** Set or change the current user's password. Requires the current password
   *  if one is set; revokes existing sessions and keeps the setter logged in. */
  setPassword: publicProcedure
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash !== null && !(await verifyPassword(input.currentPassword ?? '', me.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const newHash = await hashPassword(input.newPassword)
      await ctx.db.update(user).set({ passwordHash: newHash, updatedAt: Date.now() }).where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      // Setting the owner's password locks the instance; persist that so the gate
      // fails closed regardless of how the owner is later resolved.
      await syncAuthRequired(ctx.db)
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
      if (!(await verifyPassword(input.currentPassword, me.passwordHash))) {
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
      await syncAuthRequired(ctx.db) // owner has no password again → instance is open
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Begin MFA enrolment for the current user: a fresh pending secret + QR.
   *  If MFA is already active, re-enrolling would clear `mfaEnabledAt` and so
   *  turn enforcement off (see the login gate) — a downgrade. Require the
   *  current password in that case, matching `disableMfa`. */
  enrollMfa: publicProcedure
    .input(z.object({ currentPassword: z.string() }).optional())
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash === null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set a password before enabling two-factor authentication.' })
      }
      if (me.mfaEnabledAt && me.mfaSecret) {
        if (!input?.currentPassword || !(await verifyPassword(input.currentPassword, me.passwordHash))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
        }
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
      const hashedRecoveryCodes = await hashRecoveryCodes(recoveryCodes)
      await ctx.db
        .update(user)
        .set({
          mfaEnabledAt: Date.now(),
          mfaRecoveryCodes: JSON.stringify(hashedRecoveryCodes),
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
      if (!(await verifyPassword(input.currentPassword, me.passwordHash))) {
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
 *  (which is consumed on success). Returns whether it was accepted. A TOTP step
 *  is accepted only if it's newer than the last-used one, so a captured code
 *  can't be replayed inside its ±1-step validity window. */
async function verifyMfaCode(db: DB, u: User, code: string): Promise<boolean> {
  if (u.mfaSecret) {
    const step = matchTotpStep(u.mfaSecret, code)
    if (step !== null) {
      if (u.mfaLastStep !== null && step <= u.mfaLastStep) return false // replayed code
      await db.update(user).set({ mfaLastStep: step, updatedAt: Date.now() }).where(eq(user.id, u.id))
      return true
    }
  }
  if (!u.mfaRecoveryCodes) return false
  const hashes = JSON.parse(u.mfaRecoveryCodes) as string[]
  const remaining = await consumeRecoveryCode(code, hashes)
  if (remaining === null) return false
  await db
    .update(user)
    .set({ mfaRecoveryCodes: JSON.stringify(remaining), updatedAt: Date.now() })
    .where(eq(user.id, u.id))
  return true
}
