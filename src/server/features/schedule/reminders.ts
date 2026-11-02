import { and, inArray, isNotNull } from 'drizzle-orm'
import { SchedulerLock, withLeaderLock } from '../../db/leader'
import { member, membership } from '../../db/schema'
import { pushConfig } from '../../notifications/config'
import { sendPushToUser } from '../../notifications/push'
import { diffDays, todayIso } from '@shared/dates'
import { formatDate, type DateFormat } from '@shared/dateFormat'
import type { DB } from '../../db/client'
import type { SendReminder } from '../todos/reminders'

// ---------------------------------------------------------------------------
// The shared half of every recurring-date nudge (a vehicle's MOT, the boiler
// service): who hears about it, how its date reads, and when the pass runs.
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 15 * 60_000
/** Nudges wait for the morning rather than landing at midnight. */
const SEND_FROM_HOUR = 9
/** Past this, a date is history rather than news: claimed without a nudge, so
 *  switching push on doesn't send a burst for every old date. */
const STALE_AFTER_DAYS = 7

export interface HouseholdFormat {
  locale: string
  dateFormat: string
}

/** "is due today", "was due 3 Mar", or null once it's too old to mention. */
export function dueWhen(dueDate: string, today: string, format: HouseholdFormat): string | null {
  const days = diffDays(today, dueDate)
  if (days < -STALE_AFTER_DAYS) return null
  if (days === 0) return 'is due today'
  const formatted = formatDate(dueDate, { locale: format.locale, dateFormat: format.dateFormat as DateFormat })
  return days < 0 ? `was due ${formatted}` : `is due ${formatted}`
}

/** Resolves who hears about a date: its member, if they can log in here, or else
 *  everyone in the household. */
export async function dueRecipients(
  db: DB,
  householdIds: string[],
): Promise<(householdId: string, memberId: string | null) => string[]> {
  const households = [...new Set(householdIds)]
  if (households.length === 0) return () => []
  const [members, owners] = await Promise.all([
    db
      .select({ householdId: membership.householdId, userId: membership.userId })
      .from(membership)
      .where(and(inArray(membership.householdId, households), isNotNull(membership.acceptedAt))),
    db.select({ id: member.id, userId: member.userId }).from(member).where(inArray(member.householdId, households)),
  ])

  return (householdId, memberId) => {
    const everyone = members.filter((m) => m.householdId === householdId).map((m) => m.userId)
    const userId = owners.find((o) => o.id === memberId)?.userId
    return userId && everyone.includes(userId) ? [userId] : everyone
  }
}

/** Runs a date pass every quarter-hour from 9am. Off without push, or the pass
 *  would mark reminders sent that could never go out. */
export function startDueReminderScheduler(
  db: DB,
  lock: SchedulerLock,
  name: string,
  pass: (db: DB, today: string, send: SendReminder) => Promise<number>,
): void {
  if (!pushConfig()) return

  const tick = async () => {
    if (new Date().getHours() < SEND_FROM_HOUR) return
    try {
      await withLeaderLock(db, lock, async () => {
        await pass(db, todayIso(), (userId, message) => sendPushToUser(db, userId, message))
      })
    } catch (err) {
      console.error(`${name} reminder pass failed:`, err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
  timer.unref?.()
}
