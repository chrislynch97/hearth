import { describe, expect, it } from 'vitest'
import { isPublicDeploy, startupSafetyProblems, type StartupSafetyInput } from './startup'

/** A safe baseline: locked, registration closed, no opt-in, not declared public.
 *  Each test turns on exactly the one thing it's about. */
const SAFE: StartupSafetyInput = {
  host: '0.0.0.0',
  bindIsLoopback: false,
  allowOpen: false,
  locked: true,
  allowOpenRegistration: false,
  isPublic: false,
  trustProxy: undefined,
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

// A public instance is behind a proxy, so an unset HEARTH_TRUST_PROXY silently
// disarms per-IP rate limiting, the Secure cookie flag, and the source address on
// every session and audit row.
describe('startupSafetyProblems — trust proxy', () => {
  const PUBLIC: StartupSafetyInput = { ...SAFE, isPublic: true }

  it('flags an unset HEARTH_TRUST_PROXY on a declared-public deploy', () => {
    const problems = startupSafetyProblems(PUBLIC)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('HEARTH_TRUST_PROXY is unset')
    expect(problems[0]).toContain('0.0.0.0')
  })

  // Whitespace is someone having "set" it in a compose file without a value.
  it('treats an empty or blank value as unset', () => {
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: '' })).toHaveLength(1)
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: '  ' })).toHaveLength(1)
  })

  it('accepts a hop count', () => {
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: '1' })).toEqual([])
  })

  it('accepts a trusted-proxy list', () => {
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: '10.0.0.0/8' })).toEqual([])
  })

  // The escape hatch: '0' parses to the same `false` as unset, but the operator
  // typed it, so it means "nothing is proxying this" rather than "I forgot".
  it('accepts an explicit opt-out', () => {
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: '0' })).toEqual([])
    expect(startupSafetyProblems({ ...PUBLIC, trustProxy: 'false' })).toEqual([])
  })

  // Warning about this on every LAN boot would be noise — a LAN instance is
  // normally directly exposed, and noise is how the checks above get ignored.
  it('says nothing on an instance that has not been declared public', () => {
    expect(startupSafetyProblems({ ...SAFE, trustProxy: undefined })).toEqual([])
  })

  // Loopback isn't reachable off-box, so there is no proxy chain to describe.
  it('says nothing on a loopback bind', () => {
    expect(startupSafetyProblems({ ...PUBLIC, bindIsLoopback: true, host: '127.0.0.1' })).toEqual([])
  })
})
