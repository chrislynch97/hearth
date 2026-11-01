/** To-do vocabulary, shared so the stored values, the router's validation and
 *  the client's labels all come from one place. */

export const TODO_PRIORITIES = ['high', 'normal', 'low'] as const

export type TodoPriority = (typeof TODO_PRIORITIES)[number]

export const DEFAULT_TODO_PRIORITY: TodoPriority = 'normal'

export const MAX_TAG_LENGTH = 40
export const MAX_TAGS_PER_TODO = 10
export const MAX_REMINDERS_PER_TODO = 5

/** Comparator putting the more urgent priority first. Unknown values sort last. */
export function comparePriority(a: string, b: string): number {
  const rank = (p: string) => {
    const index = TODO_PRIORITIES.indexOf(p as TodoPriority)
    return index === -1 ? TODO_PRIORITIES.length : index
  }
  return rank(a) - rank(b)
}

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
