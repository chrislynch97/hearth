/** Pure net-worth logic (Phase 6). Accounts hold dated balance snapshots; net
 *  worth subtracts liability balances from asset balances. All values are
 *  integer minor units. Dates are `YYYY-MM-DD` and compare lexicographically.
 *
 *  An account's value "as of" a date is its most recent snapshot on or before
 *  that date — balances carry forward until the next one is recorded. */

export type AccountKind = 'asset' | 'liability'

export interface AccountLike {
  id: string
  kind: AccountKind
}

export interface BalanceLike {
  accountId: string
  asOfDate: string
  value: number
}

export interface NetWorthPoint {
  date: string
  assets: number
  liabilities: number
  netWorth: number
}

/** The most recent balance for an account on or before `asOf`, or null if the
 *  account has no snapshot by then. */
export function balanceAsOf(balances: BalanceLike[], accountId: string, asOf: string): number | null {
  let best: BalanceLike | null = null
  for (const b of balances) {
    if (b.accountId !== accountId) continue
    if (b.asOfDate > asOf) continue
    if (best === null || b.asOfDate > best.asOfDate) best = b
  }
  return best ? best.value : null
}

/** Assets total, liabilities total, and net worth as of a single date. */
export function netWorthAsOf(
  accounts: AccountLike[],
  balances: BalanceLike[],
  asOf: string,
): NetWorthPoint {
  let assets = 0
  let liabilities = 0
  for (const acc of accounts) {
    const value = balanceAsOf(balances, acc.id, asOf)
    if (value === null) continue
    if (acc.kind === 'asset') assets += value
    else liabilities += value
  }
  return { date: asOf, assets, liabilities, netWorth: assets - liabilities }
}

/** One net-worth point per distinct snapshot date, oldest-first — the series
 *  behind the trend chart. Each point carries every account's latest balance
 *  forward to that date. */
export function netWorthTimeline(accounts: AccountLike[], balances: BalanceLike[]): NetWorthPoint[] {
  const dates = [...new Set(balances.map((b) => b.asOfDate))].sort((a, b) => a.localeCompare(b))
  return dates.map((d) => netWorthAsOf(accounts, balances, d))
}
