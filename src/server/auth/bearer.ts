/** Bearer-token primitives, shared by every credential Hearth mints: session
 *  cookies, invite links, and the emailed verification / password-reset links.
 *
 *  Their own module rather than session.ts so the mail subsystem can hash a
 *  token without importing (and being imported by) the session store.
 */

import { createHash, randomBytes } from 'node:crypto'

/** A fresh, unguessable bearer token (256 bits). The raw value goes to the
 *  client; only its hash is ever stored. */
export function newBearerToken(): string {
  return randomBytes(32).toString('hex')
}

/** Storage form of a bearer token: sha256(token) as hex. The tokens are 256-bit
 *  random, so a single fast hash (no KDF) makes lookups cheap while ensuring a
 *  leaked database or backup exposes only hashes, never usable credentials. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
