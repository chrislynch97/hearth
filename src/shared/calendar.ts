/** What the home calendar can show, shared so the query and the toggles agree. */
export const CALENDAR_KINDS = ['bill', 'todo', 'savings', 'vehicle'] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export interface CalendarEvent {
  /** Unique within a query, so a list can key on it. */
  id: string
  kind: CalendarKind
  date: string // YYYY-MM-DD
  title: string
  /** Minor units, for anything with a price. */
  amount: number | null
  /** Where tapping it goes. */
  href: string
}

/** The longest span one query may ask for: a month grid, with room to spare. */
export const MAX_CALENDAR_DAYS = 62
