import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { recordSecurityEvent } from '../trpc/audit'
import { user } from '../db/schema'
import { defaultHouseholdFor, getUser } from '../auth/session'
import { RateLimiter } from '../auth/rateLimit'
import { mailConfig, mailEnabled } from '../mail/config'
import { trySendMail } from '../mail/mailer'
import { verifyEmail } from '../mail/templates'
import { consumeEmailToken, issueEmailToken, VERIFY_TTL_MS } from '../mail/tokens'
import { MAX_TOKEN_LENGTH } from '../../shared/input-limits'

// Sending a verification mail is a free outbound message triggered by a logged-in
// user, so cap it per account: 5 an hour is plenty for "it didn't arrive, resend".
const verifySendLimiter = new RateLimiter('email-verify-send', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
})

// Guessing a 256-bit token is hopeless, but an unthrottled public endpoint is
// still free work for anyone who points a script at it.
const verifyClaimLimiter = new RateLimiter('email-verify-claim', {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 20,
  blockMs: 60 * 60 * 1000,
})

export const emailRouter = router({
  /** Whether this instance can send mail, and the state of the current user's
   *  address. Drives the account settings card. */
  status: publicProcedure.query(async ({ ctx }) => {
    const me = ctx.userId ? await getUser(ctx.db, ctx.userId) : null
    return {
      enabled: mailEnabled(),
      email: me?.email ?? null,
      verified: (me?.emailVerifiedAt ?? null) !== null,
    }
  }),

  /** Email the current user a link that proves their address is theirs. */
  sendVerification: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    const config = mailConfig()
    if (!config) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This instance is not set up to send email.' })
    }
    const me = await getUser(ctx.db, ctx.userId)
    if (!me?.email) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add an email address to your account first.' })
    }
    if (me.emailVerifiedAt !== null) return { sent: false as const, alreadyVerified: true as const }

    const now = Date.now()
    if (!(await verifySendLimiter.check(ctx.db, me.id, now)).allowed) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many verification emails. Try again later.' })
    }
    await verifySendLimiter.fail(ctx.db, me.id, now)

    const token = await issueEmailToken(ctx.db, {
      userId: me.id,
      purpose: 'email_verify',
      email: me.email,
      ttlMs: VERIFY_TTL_MS,
    })
    const sent = await trySendMail(
      verifyEmail({
        to: me.email,
        origin: config.publicUrl,
        token,
        displayName: me.displayName,
        ttlMs: VERIFY_TTL_MS,
      }),
    )
    // Record the request, never the token (issue #49).
    recordSecurityEvent(ctx, {
      entityType: 'user',
      entityId: me.id,
      action: 'email_verification_sent',
      details: { email: me.email, sent },
    })
    if (!sent) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not send the email. Check the server logs.' })
    }
    return { sent: true as const, alreadyVerified: false as const }
  }),

  /** Public: claim a verification token. Public because the link is usually
   *  opened in whatever browser the mail app hands it to, which may well have no
   *  session — and the token itself is the proof, so a session adds nothing. */
  verify: publicProcedure
    .input(z.object({ token: z.string().max(MAX_TOKEN_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const key = ctx.clientKey ?? 'unknown'
      const now = Date.now()
      if (!(await verifyClaimLimiter.check(ctx.db, key, now)).allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' })
      }

      const claimed = await consumeEmailToken(ctx.db, 'email_verify', input.token)
      if (!claimed) {
        await verifyClaimLimiter.fail(ctx.db, key, now)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This link is invalid, already used, or expired.' })
      }

      // Only mark the address that was actually proven. If the user changed their
      // email after asking for the link, the token proves an address they no
      // longer hold — claim it, verify nothing, and let them request a new one.
      const [updated] = await ctx.db
        .update(user)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(user.id, claimed.userId), eq(user.email, claimed.email), isNull(user.emailVerifiedAt)))
        .returning({ id: user.id, email: user.email })
      if (!updated) {
        const current = await getUser(ctx.db, claimed.userId)
        // Already verified is a success as far as the person clicking is
        // concerned; a changed address is not.
        if (current?.email === claimed.email && current.emailVerifiedAt !== null) {
          return { ok: true as const, email: claimed.email }
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That address is no longer on the account. Request a new verification email.',
        })
      }

      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: claimed.userId,
        action: 'email_verified',
        details: { email: claimed.email },
        householdId: await defaultHouseholdFor(ctx.db, claimed.userId),
        actorUserId: claimed.userId,
      })
      return { ok: true as const, email: claimed.email }
    }),
})
