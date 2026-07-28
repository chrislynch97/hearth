/** Single-use, emailed tokens for address verification and password reset (#111).
 *
 *  Same shape as sessions and invites: a 256-bit random value goes out in the
 *  link, only its sha256 is stored, and claiming it is one atomic UPDATE so two
 *  concurrent clicks can't both win.
 */

import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'
import type { DB, DBOrTx } from '../db/client'
import { emailToken } from '../db/schema'
import { hashToken, newBearerToken } from '../auth/bearer'
import { newId } from '../../shared/ids'

export type EmailTokenPurpose = 'email_verify' | 'password_reset'

/** Verification links are followed at leisure — often from a phone, hours later. */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Reset links are a live credential for the account, so they expire fast. */
export const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Mint a token for `userId` + `purpose`, returning the raw value to email.
 *
 *  Any outstanding token for the same user and purpose is dropped first: asking
 *  for a second reset link must retire the first, so a link intercepted earlier
 *  stops working the moment the real owner notices and re-requests. */
export async function issueEmailToken(
  db: DBOrTx,
  opts: { userId: string; purpose: EmailTokenPurpose; email: string; ttlMs: number },
  now: Date = new Date(),
): Promise<string> {
  await db
    .delete(emailToken)
    .where(and(eq(emailToken.userId, opts.userId), eq(emailToken.purpose, opts.purpose)))

  const token = newBearerToken()
  await db.insert(emailToken).values({
    id: newId(),
    tokenHash: hashToken(token),
    userId: opts.userId,
    purpose: opts.purpose,
    email: opts.email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + opts.ttlMs),
    consumedAt: null,
  })
  return token
}

/** Claim a token: marks it consumed and returns what it proves, or `null` when
 *  it's unknown, already used, expired, or issued for a different purpose.
 *
 *  The purpose is part of the match, not a check afterwards — a verification
 *  token must never be redeemable as a password reset. */
export async function consumeEmailToken(
  db: DBOrTx,
  purpose: EmailTokenPurpose,
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string; email: string } | null> {
  const [claimed] = await db
    .update(emailToken)
    .set({ consumedAt: now })
    .where(
      and(
        eq(emailToken.tokenHash, hashToken(token)),
        eq(emailToken.purpose, purpose),
        isNull(emailToken.consumedAt),
        gt(emailToken.expiresAt, now),
      ),
    )
    .returning({ userId: emailToken.userId, email: emailToken.email })
  return claimed ?? null
}

/** Drop every token that is spent or past its deadline. Claiming already ignores
 *  those rows, so this only reclaims storage — but without it the table grows by
 *  one row per reset request forever. Called from the session purge tick. */
export async function deleteExpiredEmailTokens(db: DB, now: Date = new Date()): Promise<void> {
  await db.delete(emailToken).where(or(lt(emailToken.expiresAt, now), isNotNull(emailToken.consumedAt)))
}
