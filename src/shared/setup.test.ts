import { describe, it, expect } from 'vitest'
import { chosenOrBlank, needsSetup, suggestUsername } from './setup'

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

describe('chosenOrBlank', () => {
  it('blanks a value still sitting at its placeholder', () => {
    expect(chosenOrBlank('owner', 'owner')).toBe('')
    expect(chosenOrBlank(undefined, 'owner')).toBe('')
  })
  it('keeps a value someone actually chose', () => {
    expect(chosenOrBlank('chris', 'owner')).toBe('chris')
  })
})

describe('suggestUsername', () => {
  it('takes the first name, lowercased and stripped of punctuation', () => {
    expect(suggestUsername('Chris Lynch')).toBe('chris')
    expect(suggestUsername("  O'Neill  Sam ")).toBe('oneill')
  })
  it('falls back to the whole name when the first word has nothing usable', () => {
    expect(suggestUsername('!!! sam')).toBe('sam')
  })
  it('gives up rather than inventing one', () => {
    expect(suggestUsername('李明')).toBe('')
    expect(suggestUsername('')).toBe('')
  })
})
