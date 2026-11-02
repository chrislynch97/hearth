import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'
import { expense } from './budget'

// ---------------------------------------------------------------------------
// Vehicles — anything the household runs: a car, a motorbike, a campervan. Each
// keeps its renewal dates (MOT, insurance), a log of one-off costs, and links to
// the bills that already pay for it. Costs are the vehicle's own record, never
// spends, so imported bank spending doesn't count the same MOT twice.
// ---------------------------------------------------------------------------

export const vehicle = pgTable('vehicle', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  // Set on create and never changed: the stable part of `/vehicles/k3x9p2-golf`.
  shortId: text('short_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('car'), // see shared/vehicles.ts
  registration: text('registration'),
  // Whose it is; null = the household's jointly.
  ownerId: text('owner_id').references(() => member.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqShortId: uniqueIndex('vehicle_short_id').on(t.householdId, t.shortId),
  householdIdx: index('vehicle_household_id_idx').on(t.householdId),
}))

export const vehicleDate = pgTable('vehicle_date', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  vehicleId: text('vehicle_id').notNull().references(() => vehicle.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                  // see shared/vehicles.ts
  label: text('label'),                          // the name of an 'other' date
  dueDate: text('due_date').notNull(),           // YYYY-MM-DD
  repeatMonths: integer('repeat_months'),        // null = one-off
  remindDays: integer('remind_days').notNull(),
  // The due date the reminder last went out for. Moving the date re-arms it.
  remindedFor: text('reminded_for'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('vehicle_date_household_id_idx').on(t.householdId),
  vehicleIdx: index('vehicle_date_vehicle_id_idx').on(t.vehicleId),
}))

export const vehicleCost = pgTable('vehicle_cost', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  vehicleId: text('vehicle_id').notNull().references(() => vehicle.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                  // see shared/vehicles.ts
  date: text('date').notNull(),                  // YYYY-MM-DD
  amount: integer('amount').notNull(),           // minor units
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('vehicle_cost_household_id_idx').on(t.householdId),
  vehicleIdx: index('vehicle_cost_vehicle_id_idx').on(t.vehicleId),
}))

// A bill pays for at most one vehicle. Lives here rather than on `expense` so the
// schema stays one-directional (vehicles → budget).
export const vehicleBill = pgTable('vehicle_bill', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  vehicleId: text('vehicle_id').notNull().references(() => vehicle.id, { onDelete: 'cascade' }),
  expenseId: text('expense_id').notNull().references(() => expense.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqExpense: uniqueIndex('vehicle_bill_expense').on(t.expenseId),
  householdIdx: index('vehicle_bill_household_id_idx').on(t.householdId),
  vehicleIdx: index('vehicle_bill_vehicle_id_idx').on(t.vehicleId),
}))

export type Vehicle = typeof vehicle.$inferSelect
export type VehicleDate = typeof vehicleDate.$inferSelect
export type VehicleCost = typeof vehicleCost.$inferSelect
