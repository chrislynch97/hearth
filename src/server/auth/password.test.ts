import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password'

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
