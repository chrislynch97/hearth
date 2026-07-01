import { describe, it, expect } from 'vitest'
import { suggestPot } from './suggest'

describe('suggestPot', () => {
  it('suggests the pot used for a repeated description', () => {
    const result = suggestPot({
      description: 'Tesco',
      ownerId: 'alice',
      priors: [{ description: 'tesco', ownerId: 'alice', potId: 'groceries-pot', date: '2026-01-01' }],
    })

    expect(result).toEqual({ potId: 'groceries-pot' })
  })

  it('picks the most frequent pot when descriptions match multiple pots', () => {
    const result = suggestPot({
      description: 'Amazon',
      ownerId: 'alice',
      priors: [
        { description: 'amazon', ownerId: 'bob', potId: 'shopping-pot', date: '2026-01-01' },
        { description: 'amazon', ownerId: 'bob', potId: 'shopping-pot', date: '2026-01-05' },
        { description: 'amazon', ownerId: 'bob', potId: 'books-pot', date: '2026-01-10' },
      ],
    })

    expect(result).toEqual({ potId: 'shopping-pot' })
  })

  it('prefers a pot previously used by the same owner over other owners', () => {
    const result = suggestPot({
      description: 'Amazon',
      ownerId: 'alice',
      priors: [
        { description: 'amazon', ownerId: 'bob', potId: 'shopping-pot', date: '2026-01-01' },
        { description: 'amazon', ownerId: 'bob', potId: 'shopping-pot', date: '2026-01-05' },
        { description: 'amazon', ownerId: 'alice', potId: 'books-pot', date: '2026-01-10' },
      ],
    })

    expect(result).toEqual({ potId: 'books-pot' })
  })

  it('returns null when there are no matching priors', () => {
    const result = suggestPot({
      description: 'Unknown Merchant',
      ownerId: 'alice',
      priors: [{ description: 'tesco', ownerId: 'alice', potId: 'groceries-pot', date: '2026-01-01' }],
    })

    expect(result).toEqual({ potId: null })
  })

  it('breaks a frequency tie by most recent date', () => {
    const result = suggestPot({
      description: 'Amazon',
      ownerId: 'alice',
      priors: [
        { description: 'amazon', ownerId: 'alice', potId: 'shopping-pot', date: '2026-01-01' },
        { description: 'amazon', ownerId: 'alice', potId: 'books-pot', date: '2026-01-10' },
      ],
    })

    expect(result).toEqual({ potId: 'books-pot' })
  })
})
