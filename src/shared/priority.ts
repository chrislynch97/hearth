/** Priority vocabulary shared by to-dos and wish lists: the stored values and
 *  their ordering. Each feature labels them in its own words. */

export const PRIORITIES = ['high', 'normal', 'low'] as const

export type Priority = (typeof PRIORITIES)[number]

export const DEFAULT_PRIORITY: Priority = 'normal'

/** Comparator putting the more urgent priority first. Unknown values sort last. */
export function comparePriority(a: string, b: string): number {
  const rank = (p: string) => {
    const index = PRIORITIES.indexOf(p as Priority)
    return index === -1 ? PRIORITIES.length : index
  }
  return rank(a) - rank(b)
}
