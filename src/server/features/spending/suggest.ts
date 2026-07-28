export interface PriorTxn {
  description: string
  ownerId: string
  potId: string | null
  date: string
}

function normalise(description: string): string {
  return description.trim().toLowerCase()
}

/** Pick the best-guess pot for a new spend based on prior transactions with the same description. */
export function suggestPot(input: { description: string; ownerId: string; priors: PriorTxn[] }): {
  potId: string | null
} {
  const { description, ownerId, priors } = input
  const normalisedDescription = normalise(description)

  const descriptionMatches = priors.filter(
    (p) => normalise(p.description) === normalisedDescription && p.potId !== null,
  )

  if (descriptionMatches.length === 0) {
    return { potId: null }
  }

  const ownerMatches = descriptionMatches.filter((p) => p.ownerId === ownerId)
  const candidates = ownerMatches.length > 0 ? ownerMatches : descriptionMatches

  const statsByPotId = new Map<string, { count: number; mostRecentDate: string }>()
  for (const candidate of candidates) {
    const potId = candidate.potId as string
    const existing = statsByPotId.get(potId)
    if (!existing) {
      statsByPotId.set(potId, { count: 1, mostRecentDate: candidate.date })
    } else {
      existing.count += 1
      if (candidate.date > existing.mostRecentDate) {
        existing.mostRecentDate = candidate.date
      }
    }
  }

  let bestPotId: string | null = null
  let bestCount = -1
  let bestDate = ''
  for (const [potId, stats] of statsByPotId) {
    if (
      stats.count > bestCount ||
      (stats.count === bestCount && stats.mostRecentDate > bestDate)
    ) {
      bestPotId = potId
      bestCount = stats.count
      bestDate = stats.mostRecentDate
    }
  }

  return { potId: bestPotId }
}
