/** Recurring due dates — a vehicle's MOT, the boiler service. Shared so each
 *  domain's router, reminder pass and forms move a date on the same way. */

import { addDays, addMonths } from './dates'

export const REPEAT_UNITS = ['week', 'month'] as const

export type RepeatUnit = (typeof REPEAT_UNITS)[number]

export const MAX_REMIND_DAYS = 365

/** A date moved on by `every` weeks or months. */
export function addRepeat(iso: string, every: number, unit: RepeatUnit): string {
  return unit === 'week' ? addDays(iso, every * 7) : addMonths(iso, every)
}

/** The day its reminder becomes due. */
export function remindOn(dueDate: string, remindDays: number): string {
  return addDays(dueDate, -remindDays)
}

/** Where a fixed-calendar date moves to once it's done: on by its repeat from
 *  whichever is later, the old due date or the day it was done, so an early MOT
 *  still lands a year out from the old date and a late one doesn't come due
 *  again at once. */
export function nextDueDate(dueDate: string, doneOn: string, every: number, unit: RepeatUnit = 'month'): string {
  let next = addRepeat(dueDate, every, unit)
  while (next <= doneOn) next = addRepeat(next, every, unit)
  return next
}

/** "Every year", "Every 2 weeks", "Just once". */
export function repeatLabel(every: number | null, unit: RepeatUnit = 'month'): string {
  if (every === null) return 'Just once'
  if (unit === 'month' && every % 12 === 0) return every === 12 ? 'Every year' : `Every ${every / 12} years`
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`
}
