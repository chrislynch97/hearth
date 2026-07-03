import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { household } from '../db/schema'
import { deriveSessionToken, hashPassword, isValidSessionToken, verifyPassword } from '../auth/password'
import { RateLimiter } from '../auth/rateLimit'
import type { DB } from '../db/client'

const HOUSEHOLD_ID = 'household'

// Throttle password attempts: 10 per 15 minutes per client, then a 15-minute block.
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
})

async function getHash(db: DB): Promise<string | null> {
  const [hh] = await db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
  return hh?.passwordHash ?? null
}

export const authRouter = router({
  /** Whether a password is configured, and whether this request is authenticated. */
  status: publicProcedure.query(async ({ ctx }) => {
    const hash = await getHash(ctx.db)
    return {
      passwordSet: hash !== null,
      authenticated: hash === null ? true : isValidSessionToken(ctx.sessionToken, hash),
    }
  }),

  login: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hash = await getHash(ctx.db)
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
    .input(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const hash = await getHash(ctx.db)
      if (hash !== null && !verifyPassword(input.currentPassword ?? '', hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      const newHash = hashPassword(input.newPassword)
      await ctx.db
        .update(household)
        .set({ passwordHash: newHash, updatedAt: Date.now() })
        .where(eq(household.id, HOUSEHOLD_ID))
      // Keep the setter logged in under the new hash.
      ctx.setSessionCookie?.(deriveSessionToken(newHash))
      return { ok: true as const }
    }),

  /** Remove the shared password (returns the instance to no-auth). */
  clearPassword: publicProcedure
    .input(z.object({ currentPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hash = await getHash(ctx.db)
      if (hash === null) return { ok: true as const }
      if (!verifyPassword(input.currentPassword, hash)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db
        .update(household)
        .set({ passwordHash: null, updatedAt: Date.now() })
        .where(eq(household.id, HOUSEHOLD_ID))
      ctx.setSessionCookie?.(null)
      return { ok: true as const }
    }),
})
