import { describe, it, expect } from 'vitest'
import {
  allProceduresIn,
  allowedOrigins,
  isAllowedOrigin,
  isLoopbackHost,
  isOpenAccessBlocked,
  openGuardConfig,
  trpcProcedures,
} from './gate'

describe('isAllowedOrigin', () => {
  it('allows an origin whose host matches the request Host', () => {
    expect(isAllowedOrigin({ origin: 'http://hearth.local:8787', host: 'hearth.local:8787' })).toBe(true)
  })

  it('rejects a cross-site origin — the forged-write case', () => {
    expect(isAllowedOrigin({ origin: 'https://evil.example', host: 'hearth.local:8787' })).toBe(false)
  })

  it('ignores the scheme, so a TLS-terminating proxy still works', () => {
    // The browser used HTTPS; the hop behind the proxy describes itself as the
    // same host. Comparing schemes here would break every reverse-proxy install.
    expect(isAllowedOrigin({ origin: 'https://hearth.example.com', host: 'hearth.example.com' })).toBe(true)
  })

  it('distinguishes hosts that differ only by port', () => {
    expect(isAllowedOrigin({ origin: 'http://hearth.local:5173', host: 'hearth.local:8787' })).toBe(false)
  })

  it('allows a missing Origin (curl, scripts, health checks — not browsers)', () => {
    expect(isAllowedOrigin({ origin: undefined, host: 'hearth.local:8787' })).toBe(true)
  })

  it('rejects the opaque "null" origin rather than treating it as absent', () => {
    // A sandboxed iframe or a stripping redirect: a real browser deliberately
    // withholding its origin, which is not the same as a non-browser client.
    expect(isAllowedOrigin({ origin: 'null', host: 'hearth.local:8787' })).toBe(false)
  })

  it('rejects an unparseable Origin', () => {
    expect(isAllowedOrigin({ origin: 'not a url', host: 'hearth.local:8787' })).toBe(false)
  })

  it('rejects when the request carries no Host to compare against', () => {
    expect(isAllowedOrigin({ origin: 'https://hearth.example.com', host: undefined })).toBe(false)
  })

  it('honours an explicitly allow-listed origin whose host differs', () => {
    expect(
      isAllowedOrigin({
        origin: 'https://hearth.example.com',
        host: 'internal-8787',
        allowed: ['https://hearth.example.com'],
      }),
    ).toBe(true)
  })
})

describe('allowedOrigins', () => {
  it('is empty by default', () => {
    expect(allowedOrigins({})).toEqual([])
  })

  it('splits, trims and drops blanks', () => {
    expect(allowedOrigins({ HEARTH_ALLOWED_ORIGINS: 'https://a.example, https://b.example ,' })).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })
})

// The argument is the adapter's `:path` route parameter, which Fastify has
// already percent-decoded once — NOT the raw URL.
describe('trpcProcedures', () => {
  it('extracts a single procedure', () => {
    expect(trpcProcedures('pots.list')).toEqual(['pots.list'])
  })

  it('splits a batched request', () => {
    expect(trpcProcedures('auth.status,auth.login')).toEqual(['auth.status', 'auth.login'])
  })

  it('decodes percent-encoded procedure paths', () => {
    // A caller could percent-encode the dots to dodge a naive string match.
    expect(trpcProcedures('data%2Eexport')).toEqual(['data.export'])
  })

  it('decodes before splitting, as @trpc/server does', () => {
    // tRPC runs decodeURIComponent over the whole path and only then splits on
    // the batching comma. Splitting first would see one procedure named
    // "auth.login,pots.list" where the router runs two. #179
    expect(trpcProcedures('auth.login%2Cpots.list')).toEqual(['auth.login', 'pots.list'])
  })

  it('resolves a double-encoded name the same way the adapter will', () => {
    // Fastify decoded `%2570ots.list` to `%70ots.list`; tRPC decodes again and
    // dispatches `pots.list`, so the gate has to see `pots.list` too.
    expect(trpcProcedures('%70ots.list')).toEqual(['pots.list'])
  })

  it('yields nothing for malformed encoding, so the gate fails closed', () => {
    expect(trpcProcedures('%ZZ')).toEqual([])
    expect(allProceduresIn(trpcProcedures('%ZZ'), new Set(['auth.login']))).toBe(false)
  })
})

describe('allProceduresIn', () => {
  const allowed = new Set(['auth.status', 'auth.login'])

  it('is true only when every procedure is allowed', () => {
    expect(allProceduresIn(['auth.status'], allowed)).toBe(true)
    expect(allProceduresIn(['auth.status', 'auth.login'], allowed)).toBe(true)
  })

  it('fails closed on a mixed batch or an empty list', () => {
    expect(allProceduresIn(['auth.status', 'data.export'], allowed)).toBe(false)
    expect(allProceduresIn(['data.export'], allowed)).toBe(false)
    expect(allProceduresIn([], allowed)).toBe(false)
  })
})

describe('isLoopbackHost', () => {
  it('recognises loopback binds', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
  })

  it('treats all-interfaces and LAN binds as non-loopback', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.10')).toBe(false)
  })

  // The whole 127.0.0.0/8 block is loopback, not just 127.0.0.1 (#54).
  it('recognises the rest of the 127.0.0.0/8 block', () => {
    expect(isLoopbackHost('127.0.0.2')).toBe(true)
    expect(isLoopbackHost('127.1.2.3')).toBe(true)
    expect(isLoopbackHost('127.255.255.255')).toBe(true)
  })

  it('unwraps a bracketed IPv6 literal', () => {
    expect(isLoopbackHost('[::1]')).toBe(true)
  })

  // Fails closed: anything that merely looks loopback-ish is network-reachable.
  it('does not match hosts that only start with 127', () => {
    expect(isLoopbackHost('127.0.0.1.example.com')).toBe(false)
    expect(isLoopbackHost('1270.0.0.1')).toBe(false)
    expect(isLoopbackHost('128.0.0.1')).toBe(false)
    expect(isLoopbackHost('localhost.example.com')).toBe(false)
  })
})

describe('openGuardConfig', () => {
  it('defaults to a non-loopback bind with open access off', () => {
    expect(openGuardConfig({})).toEqual({ bindIsLoopback: false, allowOpen: false, isPublic: false })
  })

  it('reads HOST, HEARTH_ALLOW_OPEN and HEARTH_PUBLIC', () => {
    expect(openGuardConfig({ HOST: '127.0.0.1' })).toEqual({
      bindIsLoopback: true,
      allowOpen: false,
      isPublic: false,
    })
    expect(openGuardConfig({ HOST: '0.0.0.0', HEARTH_ALLOW_OPEN: '1', HEARTH_PUBLIC: '1' })).toEqual({
      bindIsLoopback: false,
      allowOpen: true,
      isPublic: true,
    })
    // Only the exact string '1' opts in.
    expect(openGuardConfig({ HEARTH_ALLOW_OPEN: 'true' }).allowOpen).toBe(false)
  })

  // Reported raw even though the guard ignores it on a public deploy: the
  // startup checks have to see the flag to tell the operator to remove it.
  it('reports HEARTH_ALLOW_OPEN as set even on a public deploy', () => {
    expect(openGuardConfig({ HEARTH_ALLOW_OPEN: '1', HEARTH_PUBLIC: '1' }).allowOpen).toBe(true)
  })
})

describe('isOpenAccessBlocked', () => {
  const LAN = { locked: false, bindIsLoopback: false, allowOpen: false, isPublic: false }

  it('blocks only an open instance that is off-box with no opt-in', () => {
    expect(isOpenAccessBlocked(LAN)).toBe(true)
  })

  it('is not blocked once locked, on loopback, or opted in', () => {
    expect(isOpenAccessBlocked({ ...LAN, locked: true })).toBe(false)
    expect(isOpenAccessBlocked({ ...LAN, bindIsLoopback: true })).toBe(false)
    expect(isOpenAccessBlocked({ ...LAN, allowOpen: true })).toBe(false)
  })

  // #115: on a hosted instance neither escape hatch means what it does on a LAN.
  // A loopback bind is a same-host reverse proxy, and open access would hand
  // every anonymous caller the first household as its owner.
  it('ignores both escape hatches on a declared-public deploy', () => {
    expect(isOpenAccessBlocked({ ...LAN, isPublic: true, allowOpen: true })).toBe(true)
    expect(isOpenAccessBlocked({ ...LAN, isPublic: true, bindIsLoopback: true })).toBe(true)
    expect(isOpenAccessBlocked({ ...LAN, isPublic: true, bindIsLoopback: true, allowOpen: true })).toBe(true)
  })

  // A public instance with an owner password is a normally-running one, not a
  // first run — the flags above only matter while there's no password.
  it('is not blocked on a locked public deploy', () => {
    expect(isOpenAccessBlocked({ ...LAN, isPublic: true, locked: true })).toBe(false)
  })
})
