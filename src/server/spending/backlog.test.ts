import { describe, it, expect } from 'vitest'
import { computeBacklog } from './backlog'

describe('computeBacklog', () => {
  it('groups unreconciled transactions by pot, unassigned, and member, handling refunds', () => {
    const pots = [
      { id: 'groceries-pot', name: 'Groceries', ownerId: 'alice' },
      { id: 'fun-pot', name: 'Fun', ownerId: 'bob' },
    ]

    const transactions = [
      // groceries-pot: 5000 spend, then a 1000 refund => total 4000, count 2
      { potId: 'groceries-pot', amount: 5000, reconciled: false, ownerId: 'alice' },
      { potId: 'groceries-pot', amount: -1000, reconciled: false, ownerId: 'alice' },
      // fun-pot: 2000 spend, unreconciled
      { potId: 'fun-pot', amount: 2000, reconciled: false, ownerId: 'bob' },
      // fun-pot: already reconciled, should be ignored entirely
      { potId: 'fun-pot', amount: 9999, reconciled: true, ownerId: 'bob' },
      // unassigned: no pot yet
      { potId: null, amount: 1500, reconciled: false, ownerId: 'alice' },
    ]

    const result = computeBacklog({ transactions, pots })

    expect(result.perPot).toEqual([
      { potId: 'groceries-pot', potName: 'Groceries', ownerId: 'alice', total: 4000, count: 2 },
      { potId: 'fun-pot', potName: 'Fun', ownerId: 'bob', total: 2000, count: 1 },
    ])

    expect(result.unassigned).toEqual({ total: 1500, count: 1 })

    expect(result.perMember).toEqual(
      expect.arrayContaining([
        { ownerId: 'alice', total: 5500, count: 3 },
        { ownerId: 'bob', total: 2000, count: 1 },
      ]),
    )

    expect(result.grandTotal).toBe(7500)
  })

  it('sorts perPot by descending absolute total', () => {
    const pots = [
      { id: 'small-pot', name: 'Small', ownerId: 'alice' },
      { id: 'big-pot', name: 'Big', ownerId: 'alice' },
    ]

    const transactions = [
      { potId: 'small-pot', amount: 100, reconciled: false, ownerId: 'alice' },
      { potId: 'big-pot', amount: -5000, reconciled: false, ownerId: 'alice' },
    ]

    const result = computeBacklog({ transactions, pots })

    expect(result.perPot.map((p) => p.potId)).toEqual(['big-pot', 'small-pot'])
  })

  it('returns empty groups when there are no unreconciled transactions', () => {
    const result = computeBacklog({ transactions: [], pots: [] })

    expect(result).toEqual({
      perPot: [],
      unassigned: { total: 0, count: 0 },
      perMember: [],
      grandTotal: 0,
    })
  })
})
