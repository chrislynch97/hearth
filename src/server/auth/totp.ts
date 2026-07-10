/** Time-based one-time passwords (RFC 6238) + one-time recovery codes.
 *
 *  Dependency-free: built on Node's crypto, matching the house style of
 *  password.ts. TOTP is HMAC-SHA1 over a 30-second counter, 6 digits — the
 *  defaults every authenticator app (Google Authenticator, 1Password, Aegis…)
 *  assumes, so we don't advertise the algorithm in the otpauth URL and rely on
 *  those defaults. */
import { createHmac, randomBytes } from 'node:crypto'
import { hashPassword, verifyPassword } from './password'

const STEP_SECONDS = 30
const DIGITS = 6
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' // RFC 4648, no padding

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, uppercase, no padding) — the encoding authenticator apps use.
// ---------------------------------------------------------------------------

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[=\s-]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error('Invalid base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

/** A fresh base32-encoded secret (20 random bytes = 160 bits, per RFC 6238). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The `otpauth://` URL an authenticator app scans/imports. */
export function buildOtpauthUrl(secret: string, account: string, issuer = 'Hearth'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** The TOTP code for a given secret at a point in time (defaults to now). */
export function generateTotp(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS)
  const counterBuf = Buffer.alloc(8)
  // 64-bit big-endian counter. writeUInt32BE the high/low halves to stay well
  // within Number's safe-integer range for any realistic date.
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  counterBuf.writeUInt32BE(counter >>> 0, 4)

  const hmac = createHmac('sha1', base32Decode(secret)).update(counterBuf).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

/** The absolute time-step `token` matches for `secret`, allowing ±`window` steps
 *  of clock drift (default ±1 step = ±30s), or `null` if it matches none. The
 *  step lets callers persist the last-accepted step and reject replays within
 *  the validity window. */
export function matchTotpStep(
  secret: string,
  token: string,
  atMs: number = Date.now(),
  window = 1,
): number | null {
  const normalized = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return null
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const stepMs = atMs + errorWindow * STEP_SECONDS * 1000
    if (generateTotp(secret, stepMs) === normalized) {
      return Math.floor(stepMs / 1000 / STEP_SECONDS)
    }
  }
  return null
}

/** Whether `token` is valid for `secret`, allowing ±`window` steps of clock
 *  drift (default ±1 step = ±30s). Constant-ish; the code space is small enough
 *  that timing isn't the threat — brute force is, which the login rate limiter
 *  handles. */
export function verifyTotp(
  secret: string,
  token: string,
  atMs: number = Date.now(),
  window = 1,
): boolean {
  return matchTotpStep(secret, token, atMs, window) !== null
}

// ---------------------------------------------------------------------------
// Recovery codes — single-use fallbacks when the authenticator is unavailable.
// Shown once at enrolment; only scrypt hashes are stored (reusing password.ts).
// ---------------------------------------------------------------------------

// Crockford-ish alphabet: no 0/O/1/I/L to avoid transcription mistakes.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_GROUPS = 2
const RECOVERY_GROUP_LEN = 5

/** A uniformly-random index into `RECOVERY_ALPHABET`. Plain `byte % len` is
 *  biased when 256 isn't a multiple of `len` (256 % 30 = 16, so low indices are
 *  ~12% more likely); reject bytes in the ragged top range and redraw. */
function randomAlphabetIndex(len: number): number {
  const limit = 256 - (256 % len) // largest multiple of len that fits in a byte
  for (;;) {
    const byte = randomBytes(1)[0]!
    if (byte < limit) return byte % len
  }
}

function randomRecoveryCode(): string {
  let out = ''
  for (let i = 0; i < RECOVERY_GROUPS * RECOVERY_GROUP_LEN; i++) {
    if (i > 0 && i % RECOVERY_GROUP_LEN === 0) out += '-'
    out += RECOVERY_ALPHABET[randomAlphabetIndex(RECOVERY_ALPHABET.length)]
  }
  return out
}

/** Generate `count` fresh recovery codes (plaintext — show once, never store). */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, randomRecoveryCode)
}

/** Normalize for comparison: strip spaces/dashes, uppercase. */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

/** Hash recovery codes for storage. */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashPassword(normalizeRecoveryCode(c))))
}

/** Try to consume `code` against stored hashes. Returns the remaining hashes
 *  (with the matched one removed) on success, or `null` if no code matched. */
export async function consumeRecoveryCode(code: string, hashes: string[]): Promise<string[] | null> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length === 0) return null
  // Check all hashes concurrently (scrypt is async now), then find the match.
  const matches = await Promise.all(hashes.map((h) => verifyPassword(normalized, h)))
  const idx = matches.indexOf(true)
  if (idx === -1) return null
  return hashes.filter((_, i) => i !== idx)
}
