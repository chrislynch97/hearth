/** Shared-password hashing + stateless session tokens.
 *
 * Uses Node's built-in scrypt (no native dependency). This is a single
 * household-level password (spec §3/§5.7), not per-user accounts. The session
 * token is a keyed HMAC of the stored hash, so it needs no server-side session
 * store and is invalidated automatically whenever the password changes. */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEYLEN = 64
const SESSION_LABEL = 'hearth-session-v1'

/** Hash a plaintext password as `scrypt:<saltHex>:<hashHex>`. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN)
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

/** Timing-safe check of a plaintext password against a stored hash. */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1] as string, 'hex')
  const expected = Buffer.from(parts[2] as string, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(plain, salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** The session cookie value for a given stored hash. Deterministic, and changes
 *  with the hash (so rotating the password logs everyone out). */
export function deriveSessionToken(storedHash: string): string {
  return createHmac('sha256', storedHash).update(SESSION_LABEL).digest('hex')
}

/** Timing-safe check that a cookie token matches the current password hash. */
export function isValidSessionToken(token: string | undefined, storedHash: string): boolean {
  if (!token) return false
  const expected = deriveSessionToken(storedHash)
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
