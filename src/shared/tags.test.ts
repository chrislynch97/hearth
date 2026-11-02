import { describe, it, expect } from 'vitest'
import { cleanTagNames } from './tags'

describe('cleanTagNames', () => {
  it('trims, collapses spaces and drops blanks', () => {
    expect(cleanTagNames(['  the   venue ', '', '   '])).toEqual(['the venue'])
  })

  it('treats names differing only in case as one, keeping the first', () => {
    expect(cleanTagNames(['Venue', 'venue', 'VENUE', 'Food'])).toEqual(['Venue', 'Food'])
  })
})
