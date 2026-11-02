/** Maintenance vocabulary, shared so the stored values, the router's validation
 *  and the client's labels all come from one place. */

import type { RepeatUnit } from './schedule'

export const MAINTENANCE_AREAS = ['heating', 'water', 'electrics', 'safety', 'outside', 'appliances', 'other'] as const

export type MaintenanceArea = (typeof MAINTENANCE_AREAS)[number]

export const MAINTENANCE_AREA_LABEL: Record<MaintenanceArea, string> = {
  heating: 'Heating',
  water: 'Plumbing',
  electrics: 'Electrics',
  safety: 'Safety',
  outside: 'Outside',
  appliances: 'Appliances',
  other: 'Other',
}

export const DEFAULT_MAINTENANCE_REMIND_DAYS = 7

export interface StarterJob {
  name: string
  area: MaintenanceArea
  every: number
  unit: RepeatUnit
  /** Things that need booking get longer. */
  remindDays: number
}

/** What an empty page offers to add in a tap: the jobs most houses forget. */
export const STARTER_JOBS: StarterJob[] = [
  { name: 'Boiler service', area: 'heating', every: 12, unit: 'month', remindDays: 30 },
  { name: 'Test smoke and CO alarms', area: 'safety', every: 1, unit: 'month', remindDays: 0 },
  { name: 'Clear the gutters', area: 'outside', every: 12, unit: 'month', remindDays: 14 },
  { name: 'Bleed the radiators', area: 'heating', every: 12, unit: 'month', remindDays: 7 },
  { name: 'Clean the cooker hood filter', area: 'appliances', every: 3, unit: 'month', remindDays: 0 },
  { name: 'Descale the kettle', area: 'appliances', every: 1, unit: 'month', remindDays: 0 },
  { name: 'Sweep the chimney', area: 'heating', every: 12, unit: 'month', remindDays: 30 },
]
