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
  /** Carried-over shortfall (or, if negative, credit) from earlier part-moves for
   *  this pot/payer — a pot-level residual that adds to what needs moving now. */
  residual: number
  spends: BacklogSpend[]
}

export interface BacklogPotGroup {
  potId: string
  potName: string
  ownerId: string // the pot's owner
  total: number
  count: number
  residual: number
  /** Breakdown by who actually paid, so catch-up can say "→ Ava £20, → Ben £14". */
  payers: BacklogPayerGroup[]
}

/** An outstanding pot-level residual from an earlier part-move (issue #72):
 *  amount = required − moved, so positive = still short, negative = a credit. */
export interface BacklogResidual {
  potId: string
  ownerId: string
  amount: number
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
  residuals?: BacklogResidual[]
}): BacklogResult {
  const { transactions, pots, residuals = [] } = input
  const potById = new Map(pots.map((p) => [p.id, p]))

  // Only spends that actually need a pot transfer.
  const pending = transactions.filter((t) => !t.reconciled && !t.settledAtSource)

  const perPot = new Map<
    string,
    { total: number; count: number; residual: number; payers: Map<string, BacklogPayerGroup> }
  >()
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
        group = { total: 0, count: 0, residual: 0, payers: new Map() }
        perPot.set(txn.potId, group)
      }
      group.total += txn.amount
      group.count += 1
      let payer = group.payers.get(txn.ownerId)
      if (!payer) {
        payer = { ownerId: txn.ownerId, total: 0, count: 0, residual: 0, spends: [] }
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

  // Fold pot-level residuals in: they add to what still needs moving even when no
  // fresh spends hit the pot this period, so a residual-only pot/payer still shows.
  for (const r of residuals) {
    if (r.amount === 0) continue
    let group = perPot.get(r.potId)
    if (!group) {
      group = { total: 0, count: 0, residual: 0, payers: new Map() }
      perPot.set(r.potId, group)
    }
    group.residual += r.amount
    let payer = group.payers.get(r.ownerId)
    if (!payer) {
      payer = { ownerId: r.ownerId, total: 0, count: 0, residual: 0, spends: [] }
      group.payers.set(r.ownerId, payer)
    }
    payer.residual += r.amount
    grandTotal += r.amount
  }

  // What still needs moving for a group = spends + residual; sort and pull-back
  // detection both key on that combined figure.
  const owed = (g: { total: number; residual: number }) => g.total + g.residual

  const perPotGroups: BacklogPotGroup[] = []
  for (const [potId, stats] of perPot) {
    const pot = potById.get(potId)
    const payers = [...stats.payers.values()].sort((a, b) => Math.abs(owed(b)) - Math.abs(owed(a)))
    for (const p of payers) p.spends.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    perPotGroups.push({
      potId,
      potName: pot?.name ?? 'Unknown',
      ownerId: pot?.ownerId ?? '',
      total: stats.total,
      count: stats.count,
      residual: stats.residual,
      payers,
    })
  }
  perPotGroups.sort((a, b) => Math.abs(owed(b)) - Math.abs(owed(a)))

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
