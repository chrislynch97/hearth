import { and, eq, inArray, isNotNull, isNull, or, ne, sql } from 'drizzle-orm'
import { SchedulerLock, withLeaderLock } from '../../db/leader'
import { household, member, membership, vehicle, vehicleDate } from '../../db/schema'
import { pushConfig } from '../../notifications/config'
import { sendPushToUser } from '../../notifications/push'
import type { SendReminder } from '../todos/reminders'
import { diffDays, todayIso } from '@shared/dates'
import { formatDate, type DateFormat } from '@shared/dateFormat'
import { shortPath } from '@shared/slug'
import { remindOn, vehicleDateName } from '@shared/vehicles'
import type { DB } from '../../db/client'

const CHECK_INTERVAL_MS = 15 * 60_000
/** Nudges wait for the morning rather than landing at midnight. */
const SEND_FROM_HOUR = 9
/** Past this, a date is history rather than news: claimed without a nudge, so
 *  switching push on doesn't send a burst for every old date. */
const STALE_AFTER_DAYS = 7

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

  const households = [...new Set(rows.map((row) => row.householdId))]
  const members = await db
    .select({ householdId: membership.householdId, userId: membership.userId })
    .from(membership)
    .where(and(inArray(membership.householdId, households), isNotNull(membership.acceptedAt)))
  const owners = await db
    .select({ id: member.id, userId: member.userId })
    .from(member)
    .where(inArray(member.householdId, households))

  let sent = 0
  for (const row of rows) {
    const days = diffDays(today, row.dueDate)
    if (days < -STALE_AFTER_DAYS) continue
    const everyone = members.filter((m) => m.householdId === row.householdId).map((m) => m.userId)
    const owner = owners.find((o) => o.id === row.ownerId)?.userId
    // Joint, or owned by someone with no login here: everybody's to see.
    const recipients = owner && everyone.includes(owner) ? [owner] : everyone
    const name = vehicleDateName(row.kind, row.label)
    const when =
      days < 0
        ? `was due ${formatDate(row.dueDate, { locale: row.locale, dateFormat: row.dateFormat as DateFormat })}`
        : days === 0
          ? 'is due today'
          : `is due ${formatDate(row.dueDate, { locale: row.locale, dateFormat: row.dateFormat as DateFormat })}`
    const message = {
      title: `${row.vehicleName}: ${name} ${when}`,
      body: days > 0 ? 'Time to get it booked.' : 'Mark it done once it’s sorted.',
      url: `/vehicles/${shortPath(row.shortId, row.vehicleName)}`,
    }
    for (const userId of recipients) {
      await send(userId, message)
      sent += 1
    }
  }
  return sent
}

/** Checks every quarter-hour, sending from 9am. Off without push, or the pass
 *  would mark reminders sent that could never go out. */
export function startVehicleReminderScheduler(db: DB): void {
  if (!pushConfig()) return

  const tick = async () => {
    if (new Date().getHours() < SEND_FROM_HOUR) return
    try {
      await withLeaderLock(db, SchedulerLock.vehicleReminders, async () => {
        await runVehicleReminderPass(db, todayIso(), (userId, message) => sendPushToUser(db, userId, message))
      })
    } catch (err) {
      console.error('Vehicle reminder pass failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.()
}
