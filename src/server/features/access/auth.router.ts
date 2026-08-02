import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import QRCode from 'qrcode'
import { router, publicProcedure } from '../../trpc/trpc'
import { recordSecurityEvent, writeSecurityEvent } from '../../trpc/audit'
import { user } from '../../db/schema'
import type { User } from '../../db/schema'
import { getInstanceSettings, setAllowOpenRegistration } from '../../db/instanceSettings'
import { provisionHousehold } from '../../db/seed'
import { isUniqueViolation } from '../../db/errors'
import { hashPassword, verifyPassword, verifyPasswordDummy } from '../../auth/password'
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
  listMemberships,
  normalizeUsername,
  syncAuthRequired,
} from '../../auth/session'
import {
  buildOtpauthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotp,
} from '../../auth/totp'
import { isOpenAccessBlocked, openGuardConfig } from '../../auth/gate'
import { EMAIL_REQUIRED_MESSAGE, emailRequiredForAccounts } from '../../auth/accountEmail'
import { mailConfig, mailEnabled } from '../../mail/config'
import { trySendMail } from '../../mail/mailer'
import { passwordResetEmail } from '../../mail/templates'
import { consumeEmailToken, issueEmailToken, RESET_TTL_MS } from '../../mail/tokens'
import { sendVerificationMail } from '../../mail/verification'
import { validatePassword, MAX_PASSWORD_LENGTH } from '../../../shared/password-policy'
import { MAX_CODE_LENGTH, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH, MAX_TOKEN_LENGTH } from '../../../shared/input-limits'
import { RateLimiter } from '../../auth/rateLimit'
import { verifyMfaCode } from '../../auth/mfa'
import { recordLoginFailure } from '../../auth/loginAudit'
import type { Context } from '../../trpc/context'

// Throttle password attempts: 30 per 15 minutes per client, then a 15-minute
// block. Deliberately looser than the per-client-per-account cap below, because
// a block here is the one with collateral: on a hosted instance whole buildings
// share an egress address (office NAT, CGNAT, a VPN exit), so a cap tight enough
// to stop one person guessing at one account is also tight enough for that
// person to lock every unrelated household behind the same address out of
// signing in (#115).
const loginLimiter = new RateLimiter('login-ip', {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 30,
  blockMs: 15 * 60 * 1000,
})

// The tight throttle, keyed on client AND target account: 10 attempts per 15
// minutes, the cap the per-client limiter used to carry. A blocked key names one
// (attacker, victim) pair, so tripping it can neither lock the account's real
// owner out (they're a different client) nor stop a neighbour on the same
// address signing in to their own household.
const loginClientAccountLimiter = new RateLimiter('login-ip-account', {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
})

// Third, account-scoped throttle keyed on the target username, to catch a
// *distributed* brute-force of one account (an attacker rotating source IPs to
// stay under the caps above). This is the one that can lock a victim out of
// their own account, so the cap is set well above what one client can spend on
// one account (10), leaving griefing to an attacker who controls five source
// addresses — and costing the victim a 15-minute wait, not their account.
const loginAccountLimiter = new RateLimiter('login-account', {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 50,
  blockMs: 15 * 60 * 1000,
})

// Throttle self-registration so an open instance can't be spammed into creating
// unbounded accounts + households: 10 per hour per client, then a 1-hour block.
const registerLimiter = new RateLimiter('register', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 60 * 60 * 1000,
})

// Reset requests are unauthenticated and each one sends mail to someone else's
// inbox, so they're throttled twice: per client, to stop a script working
// through a list, and per account, so one address can't be mail-bombed from
// rotating IPs. The account cap is the higher of the two so a single client —
// already capped at 5 — can never lock a known victim out of their own recovery.
const resetRequestLimiter = new RateLimiter('reset-request-ip', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
})
const resetAccountLimiter = new RateLimiter('reset-request-account', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 60 * 60 * 1000,
})

// Guessing a 256-bit token is hopeless; this just stops the endpoint being free
// work for a script.
const resetClaimLimiter = new RateLimiter('reset-claim', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 20,
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
    const openGuard = openGuardConfig()
    return {
      passwordSet: locked,
      authenticated: locked ? s !== null : true,
      // When true the instance is open but exposed off-box with no opt-in, so the
      // HTTP gate blocks every protected procedure. The SPA renders a first-run
      // "set your owner password" screen instead of a dead app (#34). `auth.status`
      // and `auth.setPassword` are on the gate's allowlist, so this reaches the
      // client and the gate can act on it.
      firstRunRequired: isOpenAccessBlocked({ locked, ...openGuard }),
      // Whether the login screen should offer "forgot your password?" — it only
      // works on an instance that can send mail (#111). Self-host without a relay
      // keeps the CLI reset (`npm run reset-owner-password`) as its answer.
      passwordResetAvailable: mailEnabled(),
      // Whether the sign-up form must collect an address (#199). Read here rather
      // than guessed from `passwordResetAvailable`: mail being available and an
      // address being compulsory are separate facts.
      emailRequired: emailRequiredForAccounts(),
      mfaEnabled: (cur?.mfaEnabledAt ?? null) !== null,
      user: cur ? { id: cur.id, username: cur.username, displayName: cur.displayName } : null,
    }
  }),

  login: publicProcedure
    .input(
      z.object({
        username: z.string().max(MAX_NAME_LENGTH),
        password: z.string().max(MAX_PASSWORD_LENGTH),
        code: z.string().max(MAX_CODE_LENGTH).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isInstanceLocked(ctx.db))) return { ok: true as const } // open instance

      const key = ctx.clientKey ?? 'unknown'
      const acctKey = normalizeUsername(input.username)
      // The client+account key. `|` can't appear in an IP, so no pair of
      // (client, account) values can collide on one key.
      const pairKey = `${key}|${acctKey}`
      const now = Date.now()
      const limits = [
        await loginLimiter.check(ctx.db, key, now),
        await loginClientAccountLimiter.check(ctx.db, pairKey, now),
        await loginAccountLimiter.check(ctx.db, acctKey, now),
      ]
      if (limits.some((l) => !l.allowed)) {
        const retryAfterMs = Math.max(...limits.map((l) => l.retryAfterMs))
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
        })
      }

      // Record a failed attempt against all three limiters.
      const recordFail = async () => {
        await loginLimiter.fail(ctx.db, key, now)
        await loginClientAccountLimiter.fail(ctx.db, pairKey, now)
        await loginAccountLimiter.fail(ctx.db, acctKey, now)
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
        await recordFail()
        await recordLoginFailure(ctx.db, u ?? null, acctKey, 'bad_password')
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect username or password' })
      }

      if (u.mfaEnabledAt && u.mfaSecret) {
        if (!input.code) return { ok: false as const, mfaRequired: true as const }
        if (!(await verifyMfaCode(ctx.db, u, input.code))) {
          await recordFail()
          await recordLoginFailure(ctx.db, u, acctKey, 'bad_mfa')
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect authentication code' })
        }
      }

      // An account with no accepted membership has nowhere to sign in to, and
      // must not be handed a session anyway: `defaultHouseholdFor` falls back to
      // the PRIMARY household, so it would land on a tenant it doesn't belong to
      // with reads ungated by role (#230). Nothing can grant it a membership back
      // either — accepting an invitation always mints a new account — so this is
      // a dead end, not a waiting room. The paths that could produce one now
      // delete the account instead; this is the fail-closed backstop for a row
      // that arrives some other way (a hand-crafted import, a legacy install).
      if ((await listMemberships(ctx.db, u.id)).length === 0) {
        await recordLoginFailure(ctx.db, u, acctKey, 'no_household')
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This account no longer belongs to any household. Ask whoever runs this instance to remove it.',
        })
      }

      await loginLimiter.reset(ctx.db, key)
      await loginClientAccountLimiter.reset(ctx.db, pairKey)
      await loginAccountLimiter.reset(ctx.db, acctKey)
      const householdId = await defaultHouseholdFor(ctx.db, u.id)
      // Record the successful sign-in against the household the session lands in.
      // The request context has no identity yet (the session is created next), so
      // pass the actor + household explicitly (issue #49).
      recordSecurityEvent(ctx, {
        entityType: 'auth',
        entityId: u.id,
        action: 'login',
        details: { mfa: Boolean(u.mfaEnabledAt && u.mfaSecret) },
        householdId,
        actorUserId: u.id,
      })
      ctx.setSessionCookie?.(await createSession(ctx.db, u.id, householdId, ctx.sessionOrigin))
      return { ok: true as const }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await deleteSession(ctx.db, ctx.sessionToken)
    ctx.setSessionCookie?.(null)
    // Only a real, logged-in session is worth recording — not the owner-fallback
    // identity an open instance hands every request (issue #49).
    if (ctx.sessionId && ctx.userId) {
      recordSecurityEvent(ctx, { entityType: 'auth', entityId: ctx.userId, action: 'logout' })
    }
    return { ok: true as const }
  }),

  /** Whether anyone may self-register a new household. Public — the login screen
   *  reads it to decide whether to offer "create an account". */
  registrationOpen: publicProcedure.query(async ({ ctx }) => {
    const { allowOpenRegistration } = await getInstanceSettings(ctx.db)
    return { allowOpenRegistration }
  }),

  /** Turn open registration on/off. Instance-wide, so restricted to the instance
   *  owner (an owner of the primary household) — not any household owner. */
  setRegistrationOpen: publicProcedure
    .input(z.object({ open: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertInstanceOwner(ctx.db, ctx.userId)
      await setAllowOpenRegistration(ctx.db, input.open)
      recordSecurityEvent(ctx, {
        entityType: 'instance',
        entityId: 'registration',
        action: 'registration_changed',
        details: { open: input.open },
      })
      return { allowOpenRegistration: input.open }
    }),

  /** Self-register: create an account and a brand-new household you own, then log
   *  in. Only when open registration is enabled.
   *
   *  An address is optional on a self-host LAN install and compulsory on a hosted
   *  one (#199) — see `emailRequiredForAccounts`. When mail is on, the
   *  confirmation link goes out immediately: the person typed the address
   *  seconds ago, so a confirmation email is expected rather than surprising. */
  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(MAX_NAME_LENGTH),
        displayName: z.string().min(1).max(MAX_NAME_LENGTH),
        password: z.string().max(MAX_PASSWORD_LENGTH),
        householdName: z.string().min(1).max(MAX_NAME_LENGTH),
        email: z.string().email().max(MAX_EMAIL_LENGTH).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { allowOpenRegistration } = await getInstanceSettings(ctx.db)
      if (!allowOpenRegistration) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration is closed on this instance.' })
      }

      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      if (!(await registerLimiter.check(ctx.db, key, now)).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many sign-ups from here. Try again later.' })
      }

      const email = input.email?.trim() || null
      if (!email && emailRequiredForAccounts()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: EMAIL_REQUIRED_MESSAGE })
      }

      const weak = validatePassword(input.password)
      if (weak) {
        await registerLimiter.fail(ctx.db, key, now)
        throw new TRPCError({ code: 'BAD_REQUEST', message: weak })
      }
      // Count the "taken" path against the limiter too, otherwise it's an
      // unthrottled username-enumeration oracle on an open-registration instance.
      // This is a friendly best-effort check; the unique index on user.username is
      // the real guard against a concurrent same-username race (handled below).
      if (await getUserByUsername(ctx.db, input.username.trim())) {
        await registerLimiter.fail(ctx.db, key, now)
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
            email,
            passwordHash,
            householdId: hid,
            role: 'owner',
          })
          return { householdId: hid, userId: uid }
        }))
      } catch (err) {
        if (isUniqueViolation(err)) {
          await registerLimiter.fail(ctx.db, key, now)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That username is taken.' })
        }
        throw err
      }

      await registerLimiter.fail(ctx.db, key, now) // count this sign-up toward the per-client cap
      if (email && mailEnabled()) {
        const sent = await sendVerificationMail(ctx.db, { id: userId, email, displayName: input.displayName.trim() })
        // Record the send, never the token (issue #49). Written directly: the
        // request context has no identity until the session below exists.
        await writeSecurityEvent(ctx.db, {
          householdId,
          actorUserId: userId,
          entityType: 'user',
          entityId: userId,
          action: 'email_verification_sent',
          details: { email, sent },
        })
      }
      ctx.setSessionCookie?.(await createSession(ctx.db, userId, householdId, ctx.sessionOrigin))
      return { ok: true as const }
    }),

  /** Public: ask for a password-reset link (#111).
   *
   *  Always reports success. Whether the account exists, whether it has an
   *  address, whether that address is verified and whether the mail actually
   *  went out are all invisible to the caller — any of them leaking turns this
   *  into an account-enumeration oracle on an unauthenticated endpoint. The
   *  operator sees the real outcome in the log and the audit trail. */
  requestPasswordReset: publicProcedure
    .input(z.object({ username: z.string().max(MAX_NAME_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const config = mailConfig()
      if (!config) return { ok: true as const }

      const key = ctx.clientKey ?? 'unknown'
      const acctKey = normalizeUsername(input.username)
      const now = Date.now()
      const ipLimit = await resetRequestLimiter.check(ctx.db, key, now)
      const acctLimit = await resetAccountLimiter.check(ctx.db, acctKey, now)
      // Even the throttle is silent: a 429 here would tell a caller which
      // usernames are worth retrying. Drop the request and report success.
      if (!ipLimit.allowed || !acctLimit.allowed) return { ok: true as const }
      await resetRequestLimiter.fail(ctx.db, key, now)
      await resetAccountLimiter.fail(ctx.db, acctKey, now)

      const u = await getUserByUsername(ctx.db, input.username.trim())
      // Only ever mail a *verified* address. An unverified one is whatever was
      // typed into a profile form or an invite — a typo there would hand account
      // recovery to a stranger who happens to own the address.
      if (!u || !u.email || u.emailVerifiedAt === null) return { ok: true as const }

      const token = await issueEmailToken(ctx.db, {
        userId: u.id,
        purpose: 'password_reset',
        email: u.email,
        ttlMs: RESET_TTL_MS,
      })
      const sent = await trySendMail(
        passwordResetEmail({
          to: u.email,
          origin: config.publicUrl,
          token,
          displayName: u.displayName,
          ttlMs: RESET_TTL_MS,
        }),
      )
      // Record the request, never the token (issue #49). Written directly rather
      // than staged: the actor is unauthenticated, so there's no context identity
      // to attribute it to, and it's worth a trail entry either way.
      await writeSecurityEvent(ctx.db, {
        householdId: await defaultHouseholdFor(ctx.db, u.id),
        actorUserId: null,
        entityType: 'user',
        entityId: u.id,
        action: 'password_reset_requested',
        details: { email: u.email, sent },
      })
      return { ok: true as const }
    }),

  /** Public: set a new password with a reset token.
   *
   *  Deliberately does NOT log the user in. Every session is revoked and they go
   *  back through the login screen — which means MFA still applies, so a reset
   *  can't be used to step around the second factor. */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().max(MAX_TOKEN_LENGTH),
        newPassword: z.string().max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      if (!(await resetClaimLimiter.check(ctx.db, key, now)).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' })
      }
      const weak = validatePassword(input.newPassword)
      // Check the password before spending the token: a rejected password must
      // leave the link usable, or one typo means requesting a whole new email.
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const claimed = await consumeEmailToken(ctx.db, 'password_reset', input.token)
      if (!claimed) {
        await resetClaimLimiter.fail(ctx.db, key, now)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This link is invalid, already used, or expired.' })
      }

      const passwordHash = await hashPassword(input.newPassword)
      await ctx.db.update(user).set({ passwordHash, updatedAt: new Date() }).where(eq(user.id, claimed.userId))
      // Revoke every session: whoever forced the reset (or the attacker who
      // prompted it) must not keep one they already held.
      await deleteUserSessions(ctx.db, claimed.userId)
      // Resetting the owner's password locks the instance; persist that so the
      // gate fails closed regardless of how the owner is later resolved.
      await syncAuthRequired(ctx.db)
      await writeSecurityEvent(ctx.db, {
        householdId: await defaultHouseholdFor(ctx.db, claimed.userId),
        actorUserId: claimed.userId,
        entityType: 'user',
        entityId: claimed.userId,
        action: 'password_reset',
        details: { via: 'email' },
      })
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Set or change the current user's password. Requires the current password
   *  if one is set; revokes existing sessions and keeps the setter logged in. */
  setPassword: publicProcedure
    .input(
      z.object({
        currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(),
        newPassword: z.string().max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash !== null && !(await verifyPassword(input.currentPassword ?? '', me.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const weak = validatePassword(input.newPassword)
      if (weak) throw new TRPCError({ code: 'BAD_REQUEST', message: weak })

      const firstTime = me.passwordHash === null
      const newHash = await hashPassword(input.newPassword)
      await ctx.db.update(user).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      // Setting the owner's password locks the instance; persist that so the gate
      // fails closed regardless of how the owner is later resolved.
      await syncAuthRequired(ctx.db)
      const householdId = await defaultHouseholdFor(ctx.db, me.id)
      // Record the event, never the password (issue #49). The new session below
      // means the request context won't reflect this user, so pass actor/household.
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: me.id,
        action: 'password_changed',
        details: { firstTime },
        householdId,
        actorUserId: me.id,
      })
      ctx.setSessionCookie?.(await createSession(ctx.db, me.id, householdId, ctx.sessionOrigin))
      return { ok: true as const }
    }),

  /** Remove the password, returning the instance to no-auth. Owner-only, and only
   *  when they're the sole account (can't reopen past other people's logins). */
  clearPassword: publicProcedure
    .input(z.object({ currentPassword: z.string().max(MAX_PASSWORD_LENGTH) }))
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
        .set({ passwordHash: null, mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: new Date() })
        .where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      await syncAuthRequired(ctx.db) // owner has no password again → instance is open
      // Record before clearing the cookie: pass actor/household so the entry is
      // attributed even though the session is about to end (issue #49).
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: me.id,
        action: 'password_removed',
        householdId: await defaultHouseholdFor(ctx.db, me.id),
        actorUserId: me.id,
      })
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),

  /** Begin MFA enrolment for the current user: a fresh pending secret + QR.
   *  If MFA is already active, re-enrolling would clear `mfaEnabledAt` and so
   *  turn enforcement off (see the login gate) — a downgrade. Require the
   *  current password in that case, matching `disableMfa`. */
  enrollMfa: publicProcedure
    .input(z.object({ currentPassword: z.string().max(MAX_PASSWORD_LENGTH) }).optional())
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
      const reenroll = Boolean(me.mfaEnabledAt && me.mfaSecret)
      const secret = generateTotpSecret()
      await ctx.db.update(user).set({ mfaSecret: secret, mfaEnabledAt: null, updatedAt: new Date() }).where(eq(user.id, me.id))
      // Re-enrolling clears mfaEnabledAt (a downgrade until reconfirmed), so the
      // start of enrolment is itself worth recording (issue #49).
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: me.id,
        action: 'mfa_enroll_started',
        details: { reenroll },
      })
      const otpauthUrl = buildOtpauthUrl(secret, me.displayName || me.username)
      const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 })
      return { secret, otpauthUrl, qrSvg }
    }),

  /** Confirm enrolment with a code; turns MFA on and returns recovery codes.
   *
   *  Revokes every other session and re-issues this one, mirroring `setPassword`.
   *  Someone turning MFA on *because* they think their account is compromised
   *  would otherwise leave the attacker's existing session untouched — MFA only
   *  gates new logins, so the intruder simply keeps the one they already hold and
   *  the whole point of the action is lost (issue #50). */
  confirmMfa: publicProcedure
    .input(z.object({ code: z.string().max(MAX_CODE_LENGTH) }))
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
          mfaEnabledAt: new Date(),
          mfaRecoveryCodes: JSON.stringify(hashedRecoveryCodes),
          updatedAt: new Date(),
        })
        .where(eq(user.id, me.id))
      await deleteUserSessions(ctx.db, me.id)
      const householdId = await defaultHouseholdFor(ctx.db, me.id)
      // Record the event, never the recovery codes (issue #49). The new session
      // below means the request context won't reflect this user, so pass
      // actor/household explicitly.
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: me.id,
        action: 'mfa_enabled',
        householdId,
        actorUserId: me.id,
      })
      ctx.setSessionCookie?.(await createSession(ctx.db, me.id, householdId, ctx.sessionOrigin))
      return { ok: true as const, recoveryCodes }
    }),

  /** Turn MFA off. Requires the current password (a sensitive downgrade). */
  disableMfa: publicProcedure
    .input(z.object({ currentPassword: z.string().max(MAX_PASSWORD_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCurrentUser(ctx)
      if (me.passwordHash === null) return { ok: true as const }
      if (!(await verifyPassword(input.currentPassword, me.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const wasEnabled = Boolean(me.mfaEnabledAt)
      await ctx.db
        .update(user)
        .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: new Date() })
        .where(eq(user.id, me.id))
      // Only a real turn-off is worth recording — not a no-op call when MFA was
      // already off (issue #49).
      if (wasEnabled) {
        recordSecurityEvent(ctx, { entityType: 'user', entityId: me.id, action: 'mfa_disabled' })
      }
      return { ok: true as const }
    }),
})
