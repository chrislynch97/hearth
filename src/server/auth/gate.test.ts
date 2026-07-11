import { describe, it, expect } from 'vitest'
import { allProceduresIn, isLoopbackHost, trpcProcedures } from './gate'

describe('trpcProcedures', () => {
  it('extracts a single procedure and strips the query string', () => {
    expect(trpcProcedures('/trpc/pots.list?batch=1&input=%7B%7D')).toEqual(['pots.list'])
  })

  it('splits and decodes a batched request', () => {
    expect(trpcProcedures('/trpc/auth.status,auth.login?batch=1')).toEqual(['auth.status', 'auth.login'])
  })

  it('decodes percent-encoded procedure paths', () => {
    // A caller could percent-encode the dots to dodge a naive string match.
    expect(trpcProcedures('/trpc/data%2Eexport')).toEqual(['data.export'])
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
})
