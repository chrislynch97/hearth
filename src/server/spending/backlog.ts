export interface BacklogTxn {
  id: string
  date: string
  description: string
  potId: string | null
  amount: number
  reconciled: boolean
  settledAtSource: boolean
  ownerId: string
}

export interface BacklogSpend {
  id: string
  date: string
  description: string
  amount: number
  ownerId: string
}

/** A "who paid" slice within a pot — the money should move out of the pot to this payer. */
export interface BacklogPayerGroup {
  ownerId: string
  total: number
  count: number
  spends: BacklogSpend[]
}

export interface BacklogPotGroup {
  potId: string
  potName: string
  ownerId: string // the pot's owner
  total: number
  count: number
  /** Breakdown by who actually paid, so catch-up can say "→ Ava £20, → Ben £14". */
  payers: BacklogPayerGroup[]
}

export interface BacklogResult {
  perPot: BacklogPotGroup[]
  unassigned: { total: number; count: number; spends: BacklogSpend[] }
  perMember: Array<{ ownerId: string; total: number; count: number }>
  grandTotal: number
}

/**
 * Summarise the catch-up backlog: un-reconciled, non-settled spends grouped by
 * pot and — within each pot — by who paid. A spend that is `settledAtSource`
 * (a pot auto-deduction or a main-account spend) needs no pot transfer, so it is
 * excluded entirely. A spend with no pot that still needs one lands in `unassigned`.
 */
export function computeBacklog(input: {
  transactions: BacklogTxn[]
  pots: Array<{ id: string; name: string; ownerId: string }>
}): BacklogResult {
  const { transactions, pots } = input
  const potById = new Map(pots.map((p) => [p.id, p]))

  // Only spends that actually need a pot transfer.
  const pending = transactions.filter((t) => !t.reconciled && !t.settledAtSource)

  const perPot = new Map<string, { total: number; count: number; payers: Map<string, BacklogPayerGroup> }>()
  const unassigned: BacklogSpend[] = []
  const perMemberTotals = new Map<string, { total: number; count: number }>()
  let unassignedTotal = 0
  let grandTotal = 0

  for (const txn of pending) {
    grandTotal += txn.amount
    const spend: BacklogSpend = {
      id: txn.id,
      date: txn.date,
      description: txn.description,
      amount: txn.amount,
      ownerId: txn.ownerId,
    }

    if (txn.potId === null) {
      unassignedTotal += txn.amount
      unassigned.push(spend)
    } else {
      let group = perPot.get(txn.potId)
      if (!group) {
        group = { total: 0, count: 0, payers: new Map() }
        perPot.set(txn.potId, group)
      }
      group.total += txn.amount
      group.count += 1
      let payer = group.payers.get(txn.ownerId)
      if (!payer) {
        payer = { ownerId: txn.ownerId, total: 0, count: 0, spends: [] }
        group.payers.set(txn.ownerId, payer)
      }
      payer.total += txn.amount
      payer.count += 1
      payer.spends.push(spend)
    }

    const memberExisting = perMemberTotals.get(txn.ownerId)
    if (memberExisting) {
      memberExisting.total += txn.amount
      memberExisting.count += 1
    } else {
      perMemberTotals.set(txn.ownerId, { total: txn.amount, count: 1 })
    }
  }

  const perPotGroups: BacklogPotGroup[] = []
  for (const [potId, stats] of perPot) {
    const pot = potById.get(potId)
    const payers = [...stats.payers.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    for (const p of payers) p.spends.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    perPotGroups.push({
      potId,
      potName: pot?.name ?? 'Unknown',
      ownerId: pot?.ownerId ?? '',
      total: stats.total,
      count: stats.count,
      payers,
    })
  }
  perPotGroups.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  unassigned.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const perMember = [...perMemberTotals].map(([ownerId, stats]) => ({
    ownerId,
    total: stats.total,
    count: stats.count,
  }))

  return {
    perPot: perPotGroups,
    unassigned: { total: unassignedTotal, count: unassigned.length, spends: unassigned },
    perMember,
    grandTotal,
  }
}
