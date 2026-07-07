import type { Member, Pot } from '../server/db/schema'

/** Persons first (by sortOrder), then joint — the ordering convention used across the app. */
export function orderMembers(members: Member[]): Member[] {
  const persons = members.filter((m) => m.kind === 'person').sort((a, b) => a.sortOrder - b.sortOrder)
  const joint = members.filter((m) => m.kind === 'joint')
  return [...persons, ...joint]
}

/**
 * Pot options for a Select, grouped by owner. Pots belong to one owner, but who
 * *paid* a spend is chosen separately now, so the picker offers every pot — the
 * owner grouping is just a visual aid (e.g. "Ava · Rail" under Ava, joint pots
 * under Joint). Only non-archived pots.
 */
export function groupedPotOptions(
  pots: Pot[],
  members: Member[],
): Array<{ group: string; items: Array<{ value: string; label: string }> }> {
  const live = pots.filter((p) => p.archivedAt === null)
  return orderMembers(members)
    .map((m) => ({
      group: m.displayName,
      items: live.filter((p) => p.ownerId === m.id).map((p) => ({ value: p.id, label: p.name })),
    }))
    .filter((g) => g.items.length > 0)
}
