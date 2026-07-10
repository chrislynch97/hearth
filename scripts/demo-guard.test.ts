import { describe, it, expect } from 'vitest'
import { looksLikeRealDb } from './demo-guard.ts'

describe('looksLikeRealDb', () => {
  it('flags the real app.db regardless of casing (win32 is case-insensitive)', () => {
    expect(looksLikeRealDb('file:./data/app.db')).toBe(true)
    expect(looksLikeRealDb('file:./data/App.db')).toBe(true)
    expect(looksLikeRealDb('file:./data/APP.DB')).toBe(true)
    expect(looksLikeRealDb('file:./data/app.db?mode=rwc')).toBe(true)
  })

  it('flags the real db with backslash separators', () => {
    expect(looksLikeRealDb('file:.\\data\\App.DB')).toBe(true)
  })

  it('allows the demo/test databases', () => {
    expect(looksLikeRealDb('file:./data/demo.db')).toBe(false)
    expect(looksLikeRealDb('file:./data/test.db')).toBe(false)
    expect(looksLikeRealDb(':memory:')).toBe(false)
  })
})
