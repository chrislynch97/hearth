export interface BacklogTxn {
  potId: string | null
  amount: number
  reconciled: boolean
  ownerId: string
}

export interface BacklogPotGroup {
  potId: string
  potName: string
  ownerId: string
  total: number
  count: number
}

export interface BacklogResult {
  perPot: BacklogPotGroup[]
  unassigned: { total: number; count: number }
  perMember: Array<{ ownerId: string; total: number; count: number }>
  grandTotal: number
}

/** Summarise un-reconciled spend transactions by pot, unassigned bucket, and member. */
export function computeBacklog(input: {
  transactions: BacklogTxn[]
  pots: Array<{ id: string; name: string; ownerId: string }>
}): BacklogResult {
  const { transactions, pots } = input
  const potById = new Map(pots.map((p) => [p.id, p]))

  const unreconciled = transactions.filter((t) => !t.reconciled)

  const perPotTotals = new Map<string, { total: number; count: number }>()
  let unassignedTotal = 0
  let unassignedCount = 0
  const perMemberTotals = new Map<string, { total: number; count: number }>()
  let grandTotal = 0

  for (const txn of unreconciled) {
    grandTotal += txn.amount

    if (txn.potId === null) {
      unassignedTotal += txn.amount
      unassignedCount += 1
    } else {
      const existing = perPotTotals.get(txn.potId)
      if (existing) {
        existing.total += txn.amount
        existing.count += 1
      } else {
        perPotTotals.set(txn.potId, { total: txn.amount, count: 1 })
      }
    }

    const memberExisting = perMemberTotals.get(txn.ownerId)
    if (memberExisting) {
      memberExisting.total += txn.amount
      memberExisting.count += 1
    } else {
      perMemberTotals.set(txn.ownerId, { total: txn.amount, count: 1 })
    }
  }

  const perPot: BacklogPotGroup[] = []
  for (const [potId, stats] of perPotTotals) {
    const pot = potById.get(potId)
    perPot.push({
      potId,
      potName: pot?.name ?? 'Unknown',
      ownerId: pot?.ownerId ?? '',
      total: stats.total,
      count: stats.count,
    })
  }
  perPot.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  const perMember = [...perMemberTotals].map(([ownerId, stats]) => ({
    ownerId,
    total: stats.total,
    count: stats.count,
  }))

  return {
    perPot,
    unassigned: { total: unassignedTotal, count: unassignedCount },
    perMember,
    grandTotal,
  }
}
