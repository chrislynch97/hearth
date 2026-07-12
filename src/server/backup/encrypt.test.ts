import { describe, it, expect } from 'vitest'
import { encryptSnapshot, decryptSnapshot } from './encrypt'

const PASS = 'correct horse battery staple'

describe('encryptSnapshot / decryptSnapshot', () => {
  it('round-trips a snapshot back to the exact plaintext', () => {
    const plaintext = JSON.stringify({ version: 1, tables: { household: [{ id: 'a' }] } })
    const enc = encryptSnapshot(plaintext, PASS)
    expect(decryptSnapshot(enc, PASS)).toBe(plaintext)
  })

  it('produces ciphertext that does not contain the plaintext', () => {
    const secret = 'password-hash-and-mfa-secret'
    const enc = encryptSnapshot(JSON.stringify({ s: secret }), PASS)
    expect(enc.includes(Buffer.from(secret))).toBe(false)
  })

  it('uses a fresh salt+iv each call, so the same input encrypts differently', () => {
    const plaintext = 'same input'
    const a = encryptSnapshot(plaintext, PASS)
    const b = encryptSnapshot(plaintext, PASS)
    expect(a.equals(b)).toBe(false)
    // ...but both still decrypt to the same plaintext.
    expect(decryptSnapshot(a, PASS)).toBe(plaintext)
    expect(decryptSnapshot(b, PASS)).toBe(plaintext)
  })

  it('fails to decrypt with the wrong passphrase', () => {
    const enc = encryptSnapshot('secret', PASS)
    expect(() => decryptSnapshot(enc, 'wrong passphrase')).toThrow(/wrong passphrase or the file is corrupt/)
  })

  it('fails to decrypt tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSnapshot('secret', PASS)
    const last = enc.length - 1
    enc[last] = (enc[last] ?? 0) ^ 0xff // flip a byte of the ciphertext
    expect(() => decryptSnapshot(enc, PASS)).toThrow()
  })

  it('rejects a truncated envelope', () => {
    expect(() => decryptSnapshot(Buffer.from([1, 2, 3]), PASS)).toThrow(/too short/)
  })

  it('rejects an unknown version byte', () => {
    const enc = encryptSnapshot('secret', PASS)
    enc[0] = 99
    expect(() => decryptSnapshot(enc, PASS)).toThrow(/unsupported encrypted-backup version 99/)
  })

  it('refuses an empty passphrase on both sides', () => {
    expect(() => encryptSnapshot('x', '')).toThrow(/passphrase/)
    expect(() => decryptSnapshot(encryptSnapshot('x', PASS), '')).toThrow(/passphrase/)
  })
})
