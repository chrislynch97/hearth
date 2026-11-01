import { describe, it, expect } from 'vitest'
import { cleanTagNames, comparePriority } from './todos'

describe('comparePriority', () => {
  it('puts urgent first and unknown values last', () => {
    expect(['low', 'mystery', 'high', 'normal'].sort(comparePriority)).toEqual(['high', 'normal', 'low', 'mystery'])
  })
})

describe('cleanTagNames', () => {
  it('trims, collapses spaces and drops blanks', () => {
    expect(cleanTagNames(['  the   venue ', '', '   '])).toEqual(['the venue'])
  })

  it('treats names differing only in case as one, keeping the first', () => {
    expect(cleanTagNames(['Venue', 'venue', 'VENUE', 'Food'])).toEqual(['Venue', 'Food'])
  })
})
