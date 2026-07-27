import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { emailToken } from '../db/schema'
import { getOwnerUser } from '../auth/session'
import { hashToken } from '../auth/bearer'
import { consumeEmailToken, deleteExpiredEmailTokens, issueEmailToken, RESET_TTL_MS } from './tokens'

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const owner = (await getOwnerUser(db))!
  return { db, userId: owner.id }
}

const issue = (db: Awaited<ReturnType<typeof setup>>['db'], userId: string, over = {}) =>
  issueEmailToken(db, { userId, purpose: 'password_reset', email: 'them@example.com', ttlMs: RESET_TTL_MS, ...over })

describe('issueEmailToken', () => {
  it('stores only the hash, never the token itself', async () => {
    const { db, userId } = await setup()
    const token = await issue(db, userId)

    const [row] = await db.select().from(emailToken)
    expect(row!.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('retires an outstanding token for the same user and purpose', async () => {
    const { db, userId } = await setup()
    const first = await issue(db, userId)
    const second = await issue(db, userId)

    expect(await db.select().from(emailToken)).toHaveLength(1)
    expect(await consumeEmailToken(db, 'password_reset', first)).toBeNull()
    expect(await consumeEmailToken(db, 'password_reset', second)).not.toBeNull()
  })

  it('leaves a token for a different purpose alone', async () => {
    const { db, userId } = await setup()
    const reset = await issue(db, userId)
    await issue(db, userId, { purpose: 'email_verify' })

    expect(await consumeEmailToken(db, 'password_reset', reset)).not.toBeNull()
  })
})

describe('consumeEmailToken', () => {
  it('returns who and what the token proves, and spends it', async () => {
    const { db, userId } = await setup()
    const token = await issue(db, userId)

    expect(await consumeEmailToken(db, 'password_reset', token)).toEqual({ userId, email: 'them@example.com' })
    // Single use: the second attempt finds nothing to claim.
    expect(await consumeEmailToken(db, 'password_reset', token)).toBeNull()
  })

  it('will not redeem a verification token as a password reset', async () => {
    const { db, userId } = await setup()
    const token = await issue(db, userId, { purpose: 'email_verify' })

    expect(await consumeEmailToken(db, 'password_reset', token)).toBeNull()
    // …and the mismatch didn't spend it.
    expect(await consumeEmailToken(db, 'email_verify', token)).not.toBeNull()
  })

  it('rejects an expired token', async () => {
    const { db, userId } = await setup()
    const token = await issue(db, userId)
    const later = new Date(Date.now() + RESET_TTL_MS + 1000)

    expect(await consumeEmailToken(db, 'password_reset', token, later)).toBeNull()
  })

  it('rejects an unknown token', async () => {
    const { db } = await setup()
    expect(await consumeEmailToken(db, 'password_reset', 'nope')).toBeNull()
  })

  it('lets only one of two concurrent claims win', async () => {
    const { db, userId } = await setup()
    const token = await issue(db, userId)

    const results = await Promise.all([
      consumeEmailToken(db, 'password_reset', token),
      consumeEmailToken(db, 'password_reset', token),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('deleteExpiredEmailTokens', () => {
  it('reclaims spent and expired rows, keeping live ones', async () => {
    const { db, userId } = await setup()
    const spent = await issue(db, userId)
    await consumeEmailToken(db, 'password_reset', spent)
    const live = await issue(db, userId, { purpose: 'email_verify' })

    await deleteExpiredEmailTokens(db)

    const rows = await db.select().from(emailToken).where(eq(emailToken.tokenHash, hashToken(live)))
    expect(rows).toHaveLength(1)
    expect(await db.select().from(emailToken)).toHaveLength(1)
  })
})
