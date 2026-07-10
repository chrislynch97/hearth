import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, verifyPasswordDummy } from './password'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', stored)).toBe(true)
    expect(await verifyPassword('wrong', stored)).toBe(false)
  })

  it('produces a different hash each time (random salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('rejects a malformed stored hash', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPassword('x', 'bcrypt:aa:bb')).toBe(false)
  })

  it('dummy verify always fails and spends real scrypt time', async () => {
    expect(await verifyPasswordDummy('anything')).toBe(false)

    // It should take roughly as long as a real verify, not return instantly —
    // that equivalence is what closes the username-enumeration timing oracle.
    const stored = await hashPassword('reference')
    const timeOf = async (fn: () => Promise<unknown>) => {
      const t = performance.now()
      await fn()
      return performance.now() - t
    }
    const real = await timeOf(() => verifyPassword('reference', stored))
    const dummy = await timeOf(() => verifyPasswordDummy('reference'))
    expect(dummy).toBeGreaterThan(real / 4)
  })
})
