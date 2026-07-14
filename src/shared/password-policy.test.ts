import { describe, it, expect } from 'vitest'
import { validatePassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './password-policy'

describe('validatePassword', () => {
  it('accepts a reasonable passphrase', () => {
    expect(validatePassword('correct-horse-staple')).toBeNull()
  })

  it('rejects passwords under the length floor', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/)
  })

  it('rejects passwords over the length ceiling (scrypt CPU guard, #45)', () => {
    expect(validatePassword('ab'.repeat(MAX_PASSWORD_LENGTH / 2))).toBeNull()
    expect(validatePassword('ab'.repeat(MAX_PASSWORD_LENGTH / 2) + 'c')).toMatch(/at most/)
  })

  it('rejects common and degenerate passwords', () => {
    expect(validatePassword('password123')).toMatch(/too common/)
    expect(validatePassword('   '.padEnd(MIN_PASSWORD_LENGTH))).toMatch(/whitespace/)
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toMatch(/repeated character/)
  })
})
