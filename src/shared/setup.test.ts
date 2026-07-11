import { describe, it, expect } from 'vitest'
import { needsSetup } from './setup'

describe('needsSetup', () => {
  it('is true when there is no household row', () => {
    expect(needsSetup(undefined)).toBe(true)
  })
  it('is true when setupCompletedAt is null', () => {
    expect(needsSetup({ setupCompletedAt: null })).toBe(true)
  })
  it('is false once setup is complete', () => {
    expect(needsSetup({ setupCompletedAt: new Date(1719000000000) })).toBe(false)
  })
})
