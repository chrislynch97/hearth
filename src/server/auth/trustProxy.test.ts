import { describe, it, expect } from 'vitest'
import { parseTrustProxy } from './trustProxy'

describe('parseTrustProxy', () => {
  it('treats unset / falsy values as no trust (directly exposed)', () => {
    expect(parseTrustProxy(undefined)).toBe(false)
    expect(parseTrustProxy('')).toBe(false)
    expect(parseTrustProxy('   ')).toBe(false)
    expect(parseTrustProxy('0')).toBe(false)
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('FALSE')).toBe(false)
  })

  it('maps a hop count to a number (single proxy = 1)', () => {
    expect(parseTrustProxy('1')).toBe(1)
    expect(parseTrustProxy(' 2 ')).toBe(2)
  })

  it('maps legacy "true" to a single hop, never boolean true', () => {
    // Fastify `trustProxy: true` trusts the whole (spoofable) XFF chain; we must
    // never produce that from an env value.
    expect(parseTrustProxy('true')).toBe(1)
    expect(parseTrustProxy('TRUE')).toBe(1)
  })

  it('parses a comma-separated list of trusted proxy IPs/CIDRs', () => {
    expect(parseTrustProxy('10.0.0.1')).toEqual(['10.0.0.1'])
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toEqual(['10.0.0.0/8', '192.168.0.0/16'])
    expect(parseTrustProxy('10.0.0.1, , 10.0.0.2,')).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})
