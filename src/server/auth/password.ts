/** Password hashing with Node's built-in scrypt (no native dependency). Used
 *  for the per-user account password. Sessions live in the `session` table
 *  (see ../auth/session), not in a token derived from the hash. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEYLEN = 64

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
