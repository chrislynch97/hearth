import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// AES-256-GCM encryption for off-site backups (#39). A snapshot holds password
// hashes and TOTP/MFA secrets, so any copy that leaves the box must be encrypted
// at rest. The key is derived from a caller-supplied passphrase with scrypt
// (memory-hard, so a leaked ciphertext resists offline brute-forcing), salted per
// file so two backups never share a key and GCM's authentication tag detects any
// tampering or wrong-passphrase attempt on decrypt.

const VERSION = 1
const SALT_LEN = 16
const IV_LEN = 12 // 96-bit nonce, the standard/recommended size for GCM
const TAG_LEN = 16
const KEY_LEN = 32 // AES-256
// scrypt cost: N=2^15 costs ~tens of ms on a modern CPU — trivial once per backup,
// but multiplies an attacker's per-guess cost enough to matter. r/p at the defaults.
const SCRYPT: import('node:crypto').ScryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const HEADER_LEN = 1 + SALT_LEN + IV_LEN + TAG_LEN

/** Encrypt a snapshot's JSON with `passphrase`. Returns a self-describing binary
 *  envelope: `[version:1][salt:16][iv:12][tag:16][ciphertext]`. The salt and IV
 *  are random per call, so encrypting the same snapshot twice yields different
 *  bytes and never reuses a (key, nonce) pair. */
export function encryptSnapshot(plaintext: string, passphrase: string): Buffer {
  if (passphrase.length === 0) throw new Error('encryptSnapshot: passphrase must not be empty')
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = scryptSync(passphrase, salt, KEY_LEN, SCRYPT)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([VERSION]), salt, iv, tag, ciphertext])
}

/** Reverse of {@link encryptSnapshot}. Throws if the envelope is malformed, the
 *  version is unknown, the passphrase is wrong, or the bytes were tampered with
 *  (GCM tag mismatch) — a bad input fails loudly rather than yielding garbage. */
export function decryptSnapshot(envelope: Buffer, passphrase: string): string {
  if (passphrase.length === 0) throw new Error('decryptSnapshot: passphrase must not be empty')
  if (envelope.length < HEADER_LEN) throw new Error('encrypted backup is too short to be valid')
  const version = envelope[0]
  if (version !== VERSION) throw new Error(`unsupported encrypted-backup version ${version}`)

  let off = 1
  const salt = envelope.subarray(off, (off += SALT_LEN))
  const iv = envelope.subarray(off, (off += IV_LEN))
  const tag = envelope.subarray(off, (off += TAG_LEN))
  const ciphertext = envelope.subarray(off)

  const key = scryptSync(passphrase, salt, KEY_LEN, SCRYPT)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // GCM `final()` throws on any tag mismatch. Give a clearer reason than the
    // raw "unable to authenticate data" for the common wrong-passphrase case.
    throw new Error('failed to decrypt backup — wrong passphrase or the file is corrupt')
  }
}
