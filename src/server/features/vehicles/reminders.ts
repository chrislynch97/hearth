import { and, eq, inArray, isNull, or, ne, sql } from 'drizzle-orm'
import { SchedulerLock } from '../../db/leader'
import { household, vehicle, vehicleDate } from '../../db/schema'
import type { SendReminder } from '../todos/reminders'
import { dueRecipients, dueWhen, startDueReminderScheduler } from '../schedule/reminders'
import { remindOn } from '@shared/schedule'
import { shortPath } from '@shared/slug'
import { vehicleDateName } from '@shared/vehicles'
import type { DB } from '../../db/client'

/** Sends one reminder per vehicle date once it's within its lead time, across all
 *  households. Claims first and sends after, as the to-do pass does. A date that
 *  moves (done, or edited) is due a fresh reminder for its new day. */
export async function runVehicleReminderPass(db: DB, today: string, send: SendReminder): Promise<number> {
  const candidates = await db
    .select({ id: vehicleDate.id, dueDate: vehicleDate.dueDate, remindDays: vehicleDate.remindDays })
    .from(vehicleDate)
    .innerJoin(vehicle, eq(vehicleDate.vehicleId, vehicle.id))
    .where(
      and(
        isNull(vehicle.archivedAt),
        or(isNull(vehicleDate.remindedFor), ne(vehicleDate.remindedFor, vehicleDate.dueDate)),
      ),
    )
  const due = candidates.filter((row) => remindOn(row.dueDate, row.remindDays) <= today).map((row) => row.id)
  if (due.length === 0) return 0

  const claimed = await db
    .update(vehicleDate)
    .set({ remindedFor: sql`${vehicleDate.dueDate}`, updatedAt: new Date() })
    .where(
      and(
        inArray(vehicleDate.id, due),
        or(isNull(vehicleDate.remindedFor), ne(vehicleDate.remindedFor, vehicleDate.dueDate)),
      ),
    )
    .returning({ id: vehicleDate.id })
  if (claimed.length === 0) return 0

  const rows = await db
    .select({
      householdId: vehicleDate.householdId,
      kind: vehicleDate.kind,
      label: vehicleDate.label,
      dueDate: vehicleDate.dueDate,
      vehicleName: vehicle.name,
      shortId: vehicle.shortId,
      ownerId: vehicle.ownerId,
      locale: household.locale,
      dateFormat: household.dateFormat,
    })
    .from(vehicleDate)
    .innerJoin(vehicle, eq(vehicleDate.vehicleId, vehicle.id))
    .innerJoin(household, eq(vehicleDate.householdId, household.id))
    .where(
      inArray(
        vehicleDate.id,
        claimed.map((row) => row.id),
      ),
    )

  const recipients = await dueRecipients(db, rows.map((row) => row.householdId))

  let sent = 0
  for (const row of rows) {
    const when = dueWhen(row.dueDate, today, row)
    if (!when) continue
    const message = {
      title: `${row.vehicleName}: ${vehicleDateName(row.kind, row.label)} ${when}`,
      body: row.dueDate > today ? 'Time to get it booked.' : 'Mark it done once it’s sorted.',
      url: `/vehicles/${shortPath(row.shortId, row.vehicleName)}`,
    }
    for (const userId of recipients(row.householdId, row.ownerId)) {
      await send(userId, message)
      sent += 1
    }
  }
  return sent
}

export function startVehicleReminderScheduler(db: DB): void {
  startDueReminderScheduler(db, SchedulerLock.vehicleReminders, 'Vehicle', runVehicleReminderPass)
}
