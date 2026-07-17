/** A household needs setup until it exists and has a setupCompletedAt timestamp. */
export function needsSetup(hh: { setupCompletedAt?: Date | null } | undefined): boolean {
  return !hh || hh.setupCompletedAt == null
}

/** The placeholder identity `ensureSeed` gives the owner account before anyone has
 *  chosen one (see src/server/db/seed.ts). The wizard's You step reads these as
 *  "not set yet" and starts its fields empty rather than pre-filling a placeholder. */
export const SEEDED_OWNER_USERNAME = 'owner'
export const SEEDED_OWNER_DISPLAY_NAME = 'Owner'

/** The value to seed a You-step field with: what's stored, unless that's still the
 *  placeholder the seed wrote. */
export function chosenOrBlank(stored: string | undefined, placeholder: string): string {
  return !stored || stored === placeholder ? '' : stored
}

/** A login name suggested from a display name — "Chris Lynch" → "chris". Uses the
 *  first word, falling back to the whole name when that word has nothing usable in
 *  it (e.g. a non-Latin script), and to '' when neither does. */
export function suggestUsername(displayName: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const [first = ''] = displayName.trim().split(/\s+/)
  return slug(first) || slug(displayName)
}
