/** Vehicle vocabulary, shared so the stored values, the router's validation and
 *  the client's labels all come from one place. */

import { addDays, addMonths } from './dates'

export const VEHICLE_KINDS = ['car', 'motorbike', 'van', 'campervan', 'other'] as const

export type VehicleKind = (typeof VEHICLE_KINDS)[number]

export const DEFAULT_VEHICLE_KIND: VehicleKind = 'car'

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = {
  car: 'Car',
  motorbike: 'Motorbike',
  van: 'Van',
  campervan: 'Campervan',
  other: 'Other',
}

/** The dates a vehicle keeps. `other` takes its name from the date's own label. */
export const VEHICLE_DATE_KINDS = ['mot', 'service', 'insurance', 'tax', 'breakdown', 'other'] as const

export type VehicleDateKind = (typeof VEHICLE_DATE_KINDS)[number]

export const VEHICLE_DATE_LABEL: Record<VehicleDateKind, string> = {
  mot: 'MOT',
  service: 'Service',
  insurance: 'Insurance renewal',
  tax: 'Road tax',
  breakdown: 'Breakdown cover',
  other: 'Other',
}

/** Insurance gets longer, to leave time to shop around. */
export const DEFAULT_REMIND_DAYS: Record<VehicleDateKind, number> = {
  mot: 14,
  service: 14,
  insurance: 30,
  tax: 14,
  breakdown: 30,
  other: 14,
}

export const DEFAULT_REPEAT_MONTHS = 12
export const MAX_REMIND_DAYS = 365

export const VEHICLE_COST_KINDS = [
  'mot',
  'service',
  'repair',
  'tyres',
  'insurance',
  'tax',
  'breakdown',
  'other',
] as const

export type VehicleCostKind = (typeof VEHICLE_COST_KINDS)[number]

export const VEHICLE_COST_LABEL: Record<VehicleCostKind, string> = {
  mot: 'MOT',
  service: 'Service',
  repair: 'Repair',
  tyres: 'Tyres',
  insurance: 'Insurance',
  tax: 'Road tax',
  breakdown: 'Breakdown cover',
  other: 'Other',
}

/** What a date reads as: its kind, or its own label for `other`. */
export function vehicleDateName(kind: string, label: string | null): string {
  if (kind === 'other') return label?.trim() || 'Other'
  return VEHICLE_DATE_LABEL[kind as VehicleDateKind] ?? kind
}

/** The day its reminder becomes due. */
export function remindOn(dueDate: string, remindDays: number): string {
  return addDays(dueDate, -remindDays)
}

/** Where a date moves to once it's done: on by its repeat from whichever is
 *  later, the old due date or the day it was done, so an early MOT still lands
 *  a year out from the old date and a late one doesn't come due again at once. */
export function nextDueDate(dueDate: string, doneOn: string, repeatMonths: number): string {
  let next = addMonths(dueDate, repeatMonths)
  while (next <= doneOn) next = addMonths(next, repeatMonths)
  return next
}
