import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import { isPrivateAddress, parseTrustProxy } from './trustProxy'

const hopFn = (raw: string) => {
  const tp = parseTrustProxy(raw)
  if (typeof tp !== 'function') throw new Error(`expected a trust function for ${raw}`)
  return tp
}

describe('parseTrustProxy', () => {
  it('treats unset / falsy values as no trust (directly exposed)', () => {
    expect(parseTrustProxy(undefined)).toBe(false)
    expect(parseTrustProxy('')).toBe(false)
    expect(parseTrustProxy('   ')).toBe(false)
    expect(parseTrustProxy('0')).toBe(false)
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('FALSE')).toBe(false)
  })

  it('maps a hop count to a function trusting that many private-address hops', () => {
    const one = hopFn('1')
    expect(one('172.18.0.5', 0)).toBe(true)
    expect(one('172.18.0.5', 1)).toBe(false)
    expect(one('203.0.113.9', 0)).toBe(false)

    const two = hopFn(' 2 ')
    expect(two('127.0.0.1', 0)).toBe(true)
    expect(two('10.0.0.2', 1)).toBe(true)
    expect(two('10.0.0.3', 2)).toBe(false)
  })

  it('maps legacy "true" to a single hop, never boolean true', () => {
    // Fastify `trustProxy: true` trusts the whole (spoofable) XFF chain; we must
    // never produce that from an env value.
    for (const raw of ['true', 'TRUE']) {
      const fn = hopFn(raw)
      expect(fn('127.0.0.1', 0)).toBe(true)
      expect(fn('127.0.0.1', 1)).toBe(false)
    }
  })

  it('parses a comma-separated list of trusted proxy IPs/CIDRs', () => {
    expect(parseTrustProxy('10.0.0.1')).toEqual(['10.0.0.1'])
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toEqual(['10.0.0.0/8', '192.168.0.0/16'])
    expect(parseTrustProxy('10.0.0.1, , 10.0.0.2,')).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('isPrivateAddress', () => {
  it('accepts loopback, private and link-local, in either address family', () => {
    const addresses = [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1',
      '::1', 'fd00::1', 'fe80::1', '::ffff:172.18.0.2',
    ]
    for (const a of addresses) {
      expect(isPrivateAddress(a), a).toBe(true)
    }
  })

  it('rejects public and malformed addresses', () => {
    const addresses = ['203.0.113.9', '172.32.0.1', '8.8.8.8', '2001:db8::1', '::ffff:8.8.8.8', 'not-an-ip', '']
    for (const a of addresses) {
      expect(isPrivateAddress(a), a).toBe(false)
    }
  })
})

// End to end through Fastify, which since 5.12 ignores a numeric hop count:
// this is the regression that would silently disarm the login rate limiter.
describe('HEARTH_TRUST_PROXY=1 through Fastify', () => {
  const ipFor = async (remoteAddress: string) => {
    const app = Fastify({ trustProxy: parseTrustProxy('1') })
    app.get('/', async (req) => req.ip)
    const res = await app.inject({
      url: '/',
      remoteAddress,
      headers: { 'x-forwarded-for': '198.51.100.7' },
    })
    await app.close()
    return res.body
  }

  it('reads the client IP from a proxy on the private network', async () => {
    expect(await ipFor('172.18.0.5')).toBe('198.51.100.7')
  })

  it('ignores X-Forwarded-For from a direct public client', async () => {
    expect(await ipFor('203.0.113.9')).toBe('203.0.113.9')
  })
})
