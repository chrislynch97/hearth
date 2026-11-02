import { and, eq, inArray, isNull, or, ne, sql } from 'drizzle-orm'
import { SchedulerLock } from '../../db/leader'
import { household, maintenanceJob } from '../../db/schema'
import type { SendReminder } from '../todos/reminders'
import { dueRecipients, dueWhen, startDueReminderScheduler } from '../schedule/reminders'
import { remindOn } from '@shared/schedule'
import type { DB } from '../../db/client'

const unsent = or(isNull(maintenanceJob.remindedFor), ne(maintenanceJob.remindedFor, maintenanceJob.dueDate))

/** Sends one reminder per job once it's within its lead time, to whoever does
 *  it or else everyone. Claims first and sends after, as the vehicle pass does. */
export async function runMaintenanceReminderPass(db: DB, today: string, send: SendReminder): Promise<number> {
  const candidates = await db
    .select({ id: maintenanceJob.id, dueDate: maintenanceJob.dueDate, remindDays: maintenanceJob.remindDays })
    .from(maintenanceJob)
    .where(and(isNull(maintenanceJob.archivedAt), unsent))
  const due = candidates.filter((row) => remindOn(row.dueDate, row.remindDays) <= today).map((row) => row.id)
  if (due.length === 0) return 0

  const claimed = await db
    .update(maintenanceJob)
    .set({ remindedFor: sql`${maintenanceJob.dueDate}`, updatedAt: new Date() })
    .where(and(inArray(maintenanceJob.id, due), unsent))
    .returning({ id: maintenanceJob.id })
  if (claimed.length === 0) return 0

  const rows = await db
    .select({
      householdId: maintenanceJob.householdId,
      name: maintenanceJob.name,
      dueDate: maintenanceJob.dueDate,
      assigneeId: maintenanceJob.assigneeId,
      locale: household.locale,
      dateFormat: household.dateFormat,
    })
    .from(maintenanceJob)
    .innerJoin(household, eq(maintenanceJob.householdId, household.id))
    .where(
      inArray(
        maintenanceJob.id,
        claimed.map((row) => row.id),
      ),
    )
  const recipients = await dueRecipients(db, rows.map((row) => row.householdId))

  let sent = 0
  for (const row of rows) {
    const when = dueWhen(row.dueDate, today, row)
    if (!when) continue
    const message = {
      title: `${row.name} ${when}`,
      body: row.dueDate > today ? 'Worth booking in now.' : 'Mark it done once it’s sorted.',
      url: '/maintenance',
    }
    for (const userId of recipients(row.householdId, row.assigneeId)) {
      await send(userId, message)
      sent += 1
    }
  }
  return sent
}

export function startMaintenanceReminderScheduler(db: DB): void {
  startDueReminderScheduler(db, SchedulerLock.maintenanceReminders, 'Maintenance', runMaintenanceReminderPass)
}
