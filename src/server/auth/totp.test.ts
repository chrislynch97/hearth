import { describe, it, expect } from 'vitest'
import {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotp,
} from './totp'

// RFC 6238 Appendix B test vector (SHA1). The seed is the ASCII "12345678901234567890".
// Base32 of that seed = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('TOTP', () => {
  it('matches the RFC 6238 SHA1 test vectors', () => {
    // T=59s → 94287082, last 6 digits = 287082; T=1111111109 → 07081804 → 081804.
    expect(generateTotp(RFC_SECRET, 59 * 1000)).toBe('287082')
    expect(generateTotp(RFC_SECRET, 1111111109 * 1000)).toBe('081804')
    expect(generateTotp(RFC_SECRET, 1234567890 * 1000)).toBe('005924')
  })

  it('verifies a freshly generated code and rejects a wrong one', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    expect(verifyTotp(secret, generateTotp(secret, now), now)).toBe(true)
    expect(verifyTotp(secret, '000000', now)).toBe(false)
    expect(verifyTotp(secret, 'notacode', now)).toBe(false)
    expect(verifyTotp(secret, '', now)).toBe(false)
  })

  it('tolerates ±1 step of clock drift but not more', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    const prevStep = generateTotp(secret, now - 30_000)
    const nextStep = generateTotp(secret, now + 30_000)
    const wayOff = generateTotp(secret, now - 120_000)
    expect(verifyTotp(secret, prevStep, now)).toBe(true)
    expect(verifyTotp(secret, nextStep, now)).toBe(true)
    expect(verifyTotp(secret, wayOff, now)).toBe(false)
  })

  it('accepts codes with surrounding whitespace', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    expect(verifyTotp(secret, ` ${generateTotp(secret, now)} `, now)).toBe(true)
  })

  it('builds a scannable otpauth URL with the expected defaults', () => {
    const url = buildOtpauthUrl('ABC234', 'My Household')
    expect(url).toContain('otpauth://totp/Hearth%3AMy%20Household')
    expect(url).toContain('secret=ABC234')
    expect(url).toContain('issuer=Hearth')
    expect(url).toContain('period=30')
    expect(url).toContain('digits=6')
  })
})

describe('recovery codes', () => {
  it('generates the requested number of distinct, readable codes', () => {
    const codes = generateRecoveryCodes(10)
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/)
  })

  it('consumes a valid code once and removes it from the pool', async () => {
    const codes = generateRecoveryCodes(3)
    const hashes = await hashRecoveryCodes(codes)

    const remaining = await consumeRecoveryCode(codes[1]!, hashes)
    expect(remaining).not.toBeNull()
    expect(remaining).toHaveLength(2)

    // The same code no longer works against the reduced pool.
    expect(await consumeRecoveryCode(codes[1]!, remaining!)).toBeNull()
  })

  it('matches regardless of case, spaces or dashes', async () => {
    const [code] = generateRecoveryCodes(1)
    const hashes = await hashRecoveryCodes([code!])
    const messy = code!.replace('-', ' ').toLowerCase()
    expect(await consumeRecoveryCode(messy, hashes)).not.toBeNull()
  })

  it('rejects an unknown or empty code', async () => {
    const hashes = await hashRecoveryCodes(generateRecoveryCodes(2))
    expect(await consumeRecoveryCode('ZZZZZ-ZZZZZ', hashes)).toBeNull()
    expect(await consumeRecoveryCode('', hashes)).toBeNull()
  })
})
