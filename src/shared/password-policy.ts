/** Shared password policy — imported by both the server (enforcement, the source
 *  of truth) and the client (inline hints). Kept free of any Node or browser API
 *  so it bundles cleanly on both sides.
 *
 *  The single shared household password is the whole defence when the instance is
 *  exposed beyond a trusted network, so we enforce a real length floor (NIST
 *  SP 800-63B leans on length over composition rules) and reject the handful of
 *  passwords that dominate every breach corpus. */

export const MIN_PASSWORD_LENGTH = 10

// Lower-cased; membership is checked case-insensitively. Deliberately tiny — this
// is a guard-rail against the worst offenders, not a full dictionary check.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwertyuiop', 'qwerty123', 'letmein', 'welcome', 'iloveyou',
  'admin123', 'changeme', 'hunter2', 'football', 'baseball', 'trustno1',
  'superman', 'starwars', 'whatever', 'monkey123',
])

/** Validate a candidate password. Returns `null` when acceptable, otherwise a
 *  human-readable reason. Whitespace-only and single-character-repeat passwords
 *  (e.g. "aaaaaaaaaa") are rejected regardless of length. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password.trim().length === 0) {
    return 'Password cannot be only whitespace.'
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common — choose something less guessable.'
  }
  if (new Set(password).size === 1) {
    return 'Password cannot be a single repeated character.'
  }
  return null
}
