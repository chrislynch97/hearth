import { describe, it, expect } from 'vitest'
import { computeBacklog, type BacklogTxn } from './backlog'

/** Build a backlog txn with sensible defaults for the fields a test doesn't care about. */
function txn(t: Partial<BacklogTxn> & { amount: number; ownerId: string; potId: string | null }): BacklogTxn {
  return {
    id: t.id ?? `${t.ownerId}-${t.potId}-${t.amount}`,
    date: t.date ?? '2026-01-01',
    description: t.description ?? 'Test',
    reconciled: t.reconciled ?? false,
    settledAtSource: t.settledAtSource ?? false,
    ...t,
  }
}

describe('computeBacklog', () => {
  it('groups by pot, then by payer, handling refunds and ignoring reconciled/settled', () => {
    const pots = [
      { id: 'groceries-pot', name: 'Groceries', ownerId: 'alice' },
      { id: 'fun-pot', name: 'Fun', ownerId: 'bob' },
    ]

    const transactions = [
      txn({ potId: 'groceries-pot', amount: 5000, ownerId: 'alice' }),
      txn({ potId: 'groceries-pot', amount: -1000, ownerId: 'alice' }),
      txn({ potId: 'fun-pot', amount: 2000, ownerId: 'bob' }),
      // already reconciled — ignored
      txn({ potId: 'fun-pot', amount: 9999, ownerId: 'bob', reconciled: true }),
      // settled at source (auto-pot / main) — ignored, no transfer needed
      txn({ potId: 'fun-pot', amount: 777, ownerId: 'bob', settledAtSource: true }),
      // unassigned: no pot yet
      txn({ potId: null, amount: 1500, ownerId: 'alice' }),
    ]

    const result = computeBacklog({ transactions, pots })

    const groceries = result.perPot.find((p) => p.potId === 'groceries-pot')!
    expect(groceries.total).toBe(4000)
    expect(groceries.count).toBe(2)
    expect(groceries.payers).toHaveLength(1)
    expect(groceries.payers[0]!.ownerId).toBe('alice')
    expect(groceries.payers[0]!.total).toBe(4000)
    expect(groceries.payers[0]!.spends).toHaveLength(2)

    const fun = result.perPot.find((p) => p.potId === 'fun-pot')!
    expect(fun.total).toBe(2000)
    expect(fun.count).toBe(1)

    expect(result.unassigned.total).toBe(1500)
    expect(result.unassigned.count).toBe(1)
    expect(result.unassigned.spends).toHaveLength(1)

    expect(result.perMember).toEqual(
      expect.arrayContaining([
        { ownerId: 'alice', total: 5500, count: 3 },
        { ownerId: 'bob', total: 2000, count: 1 },
      ]),
    )
    expect(result.grandTotal).toBe(7500)
  })

  it('breaks a single pot down by who paid', () => {
    const pots = [{ id: 'eating-out', name: 'Eating Out', ownerId: 'joint' }]
    const transactions = [
      txn({ potId: 'eating-out', amount: 2000, ownerId: 'alice', id: 'a1' }),
      txn({ potId: 'eating-out', amount: 1400, ownerId: 'bob', id: 'b1' }),
      txn({ potId: 'eating-out', amount: 600, ownerId: 'alice', id: 'a2' }),
    ]
    const result = computeBacklog({ transactions, pots })
    const pot = result.perPot[0]!
    expect(pot.total).toBe(4000)
    // Payers sorted by descending absolute total: alice (2600) then bob (1400).
    expect(pot.payers.map((p) => [p.ownerId, p.total])).toEqual([
      ['alice', 2600],
      ['bob', 1400],
    ])
  })

  it('sorts perPot by descending absolute total', () => {
    const pots = [
      { id: 'small-pot', name: 'Small', ownerId: 'alice' },
      { id: 'big-pot', name: 'Big', ownerId: 'alice' },
    ]
    const transactions = [
      txn({ potId: 'small-pot', amount: 100, ownerId: 'alice' }),
      txn({ potId: 'big-pot', amount: -5000, ownerId: 'alice' }),
    ]
    const result = computeBacklog({ transactions, pots })
    expect(result.perPot.map((p) => p.potId)).toEqual(['big-pot', 'small-pot'])
  })

  it('returns empty groups when there is nothing to reconcile', () => {
    const result = computeBacklog({ transactions: [], pots: [] })
    expect(result).toEqual({
      perPot: [],
      unassigned: { total: 0, count: 0, spends: [] },
      perMember: [],
      grandTotal: 0,
    })
  })
})
