/** Limits and tidying for free-text tags, shared by to-dos and wish lists. */

export const MAX_TAG_LENGTH = 40
export const MAX_TAGS = 10

/** Tidies typed tag names and drops blanks and repeats, ignoring case. The first
 *  spelling wins, so "Venue, venue" is one tag. */
export function cleanTagNames(names: readonly string[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()]
}
