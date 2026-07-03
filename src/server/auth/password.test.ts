import { describe, it, expect } from 'vitest'
import { deriveSessionToken, hashPassword, isValidSessionToken, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse')
    expect(verifyPassword('correct horse', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('produces a different hash each time (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('rejects a malformed stored hash', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false)
    expect(verifyPassword('x', 'bcrypt:aa:bb')).toBe(false)
  })
})

describe('session tokens', () => {
  it('is deterministic for a given hash and validates', () => {
    const stored = hashPassword('pw')
    const token = deriveSessionToken(stored)
    expect(deriveSessionToken(stored)).toBe(token)
    expect(isValidSessionToken(token, stored)).toBe(true)
  })

  it('changes when the password (hash) changes, invalidating old tokens', () => {
    const first = hashPassword('pw')
    const second = hashPassword('pw') // different salt → different hash
    const token = deriveSessionToken(first)
    expect(isValidSessionToken(token, second)).toBe(false)
  })

  it('rejects a missing or wrong token', () => {
    const stored = hashPassword('pw')
    expect(isValidSessionToken(undefined, stored)).toBe(false)
    expect(isValidSessionToken('nope', stored)).toBe(false)
  })
})
