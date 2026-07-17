import { describe, expect, it } from 'vitest'
import { isPublicDeploy, startupSafetyProblems, type StartupSafetyInput } from './startup'

/** A safe baseline: locked, registration closed, no opt-in. Each test turns on
 *  exactly the one thing it's about. */
const SAFE: StartupSafetyInput = {
  host: '0.0.0.0',
  bindIsLoopback: false,
  allowOpen: false,
  locked: true,
  allowOpenRegistration: false,
}

describe('isPublicDeploy', () => {
  it('is off unless the operator opts in', () => {
    expect(isPublicDeploy({})).toBe(false)
    expect(isPublicDeploy({ HEARTH_PUBLIC: '1' })).toBe(true)
  })

  // Fails closed the same way HEARTH_ALLOW_OPEN does: only the exact string.
  it('only accepts the exact string 1', () => {
    expect(isPublicDeploy({ HEARTH_PUBLIC: 'true' })).toBe(false)
    expect(isPublicDeploy({ HEARTH_PUBLIC: '0' })).toBe(false)
  })

  // NODE_ENV is production in every Docker deployment, LAN ones included, so it
  // must not be able to make these checks fatal on its own.
  it('ignores NODE_ENV', () => {
    expect(isPublicDeploy({ NODE_ENV: 'production' })).toBe(false)
  })
})

describe('startupSafetyProblems', () => {
  it('finds nothing wrong with a locked, closed instance', () => {
    expect(startupSafetyProblems(SAFE)).toEqual([])
  })

  it('flags HEARTH_ALLOW_OPEN on a non-loopback bind with no owner password', () => {
    const problems = startupSafetyProblems({ ...SAFE, allowOpen: true, locked: false })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('HEARTH_ALLOW_OPEN=1')
    expect(problems[0]).toContain('0.0.0.0')
  })

  // The flag is inert while a password is set, but it's still wrong to leave it
  // on a public box: clearing the password later would throw the instance open.
  it('flags HEARTH_ALLOW_OPEN even when the instance is locked', () => {
    const problems = startupSafetyProblems({ ...SAFE, allowOpen: true, locked: true })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('no effect right now')
  })

  // Loopback is unreachable off-box, so the opt-in can't expose anything.
  it('ignores HEARTH_ALLOW_OPEN on a loopback bind', () => {
    expect(
      startupSafetyProblems({ ...SAFE, allowOpen: true, locked: false, bindIsLoopback: true, host: '127.0.0.1' }),
    ).toEqual([])
  })

  it('flags open registration with no owner password', () => {
    const problems = startupSafetyProblems({ ...SAFE, allowOpenRegistration: true, locked: false })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Open registration')
  })

  it('accepts open registration once an owner password is set', () => {
    expect(startupSafetyProblems({ ...SAFE, allowOpenRegistration: true, locked: true })).toEqual([])
  })

  // A fresh public install boots with no owner password and has to stay
  // bootable — you set the password through the UI on first run.
  it('does not flag a password-less first run on its own', () => {
    expect(startupSafetyProblems({ ...SAFE, locked: false })).toEqual([])
  })

  it('reports every problem at once', () => {
    expect(
      startupSafetyProblems({ ...SAFE, allowOpen: true, locked: false, allowOpenRegistration: true }),
    ).toHaveLength(2)
  })
})
