/** Password hashing with Node's built-in scrypt (no native dependency). Used
 *  for the per-user account password. Sessions live in the `session` table
 *  (see ../auth/session), not in a token derived from the hash.
 *
 *  scrypt is deliberately CPU-heavy (~16 MB, tens of ms). We use the ASYNC
 *  `scrypt()` (via a libuv worker thread) rather than `scryptSync()` so a login
 *  or recovery-code check never blocks the event loop — on the Raspberry-Pi
 *  target the sync variant could freeze every in-flight request for 1–3 s. */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const SCRYPT_KEYLEN = 64

/** Hash a plaintext password as `scrypt:<saltHex>:<hashHex>`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scryptAsync(plain, salt, SCRYPT_KEYLEN)) as Buffer
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

/** Timing-safe check of a plaintext password against a stored hash. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1] as string, 'hex')
  const expected = Buffer.from(parts[2] as string, 'hex')
  if (expected.length === 0) return false
  const actual = (await scryptAsync(plain, salt, expected.length)) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
