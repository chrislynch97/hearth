import { describe, it, expect } from 'vitest'
import { balanceAsOf, netWorthAsOf, netWorthTimeline } from './networth'
import type { AccountLike, BalanceLike } from './networth'

const accounts: AccountLike[] = [
  { id: 'house', kind: 'asset' },
  { id: 'pension', kind: 'asset' },
  { id: 'mortgage', kind: 'liability' },
]

const balances: BalanceLike[] = [
  { accountId: 'house', asOfDate: '2024-01-01', value: 30000000 },
  { accountId: 'house', asOfDate: '2025-01-01', value: 32000000 },
  { accountId: 'pension', asOfDate: '2024-06-01', value: 5000000 },
  { accountId: 'mortgage', asOfDate: '2024-01-01', value: 20000000 },
  { accountId: 'mortgage', asOfDate: '2025-01-01', value: 18000000 },
]

describe('balanceAsOf', () => {
  it('returns the latest snapshot on or before the date', () => {
    expect(balanceAsOf(balances, 'house', '2024-12-31')).toBe(30000000)
    expect(balanceAsOf(balances, 'house', '2025-06-01')).toBe(32000000)
  })
  it('returns null before the account has any snapshot', () => {
    expect(balanceAsOf(balances, 'pension', '2024-01-01')).toBeNull()
  })
})

describe('netWorthAsOf', () => {
  it('sums assets minus liabilities using carried-forward balances', () => {
    // 2024-07-01: house 30,000,000 + pension 5,000,000 − mortgage 20,000,000
    const p = netWorthAsOf(accounts, balances, '2024-07-01')
    expect(p.assets).toBe(35000000)
    expect(p.liabilities).toBe(20000000)
    expect(p.netWorth).toBe(15000000)
  })
  it('ignores accounts with no snapshot yet', () => {
    // 2024-03-01: only house and mortgage have snapshots; pension excluded.
    const p = netWorthAsOf(accounts, balances, '2024-03-01')
    expect(p.assets).toBe(30000000)
    expect(p.liabilities).toBe(20000000)
    expect(p.netWorth).toBe(10000000)
  })
})

describe('netWorthTimeline', () => {
  it('produces one oldest-first point per distinct snapshot date', () => {
    const series = netWorthTimeline(accounts, balances)
    expect(series.map((p) => p.date)).toEqual(['2024-01-01', '2024-06-01', '2025-01-01'])
    expect(series.map((p) => p.netWorth)).toEqual([
      10000000, // house 30M − mortgage 20M
      15000000, // + pension 5M
      19000000, // house 32M + pension 5M − mortgage 18M
    ])
  })
  it('is empty when there are no balances', () => {
    expect(netWorthTimeline(accounts, [])).toEqual([])
  })
})
