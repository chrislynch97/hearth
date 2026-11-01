import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm'
import { member, membership, todo, todoList, todoReminder } from '../../db/schema'
import { shortPath } from '@shared/slug'
import type { DB } from '../../db/client'

export interface ReminderMessage {
  title: string
  body: string
  url: string
}

export type SendReminder = (userId: string, message: ReminderMessage) => Promise<void>

/** Sends every reminder that has come due, across all households. Claims first
 *  and sends after: a crash in between loses a reminder rather than doubling it.
 *  Ticked to-dos are claimed too, or un-ticking one would fire a stale nudge. */
export async function runTodoReminderPass(db: DB, now: Date, send: SendReminder): Promise<number> {
  const claimed = await db
    .update(todoReminder)
    .set({ sentAt: now, updatedAt: now })
    .where(and(isNull(todoReminder.sentAt), lte(todoReminder.remindAt, now)))
    .returning({ todoId: todoReminder.todoId })
  if (claimed.length === 0) return 0

  const todos = await db
    .select({
      id: todo.id,
      householdId: todo.householdId,
      title: todo.title,
      listName: todoList.name,
      listShortId: todoList.shortId,
      assigneeId: todo.assigneeId,
    })
    .from(todo)
    .leftJoin(todoList, eq(todo.listId, todoList.id))
    .where(
      and(
        inArray(todo.id, [...new Set(claimed.map((row) => row.todoId))]),
        isNull(todo.completedAt),
        isNull(todo.archivedAt),
      ),
    )
  if (todos.length === 0) return 0

  const households = [...new Set(todos.map((row) => row.householdId))]
  const members = await db
    .select({ householdId: membership.householdId, userId: membership.userId })
    .from(membership)
    .where(and(inArray(membership.householdId, households), isNotNull(membership.acceptedAt)))
  const assignees = await db
    .select({ id: member.id, userId: member.userId })
    .from(member)
    .where(inArray(member.householdId, households))

  let sent = 0
  for (const row of todos) {
    const everyone = members.filter((m) => m.householdId === row.householdId).map((m) => m.userId)
    const assignee = assignees.find((a) => a.id === row.assigneeId)?.userId
    // Unassigned, joint, or someone with no login here: it's everybody's to see.
    const recipients = assignee && everyone.includes(assignee) ? [assignee] : everyone
    const message = {
      title: row.title,
      body: row.listName ? `Reminder from ${row.listName}` : 'To-do reminder',
      url: row.listShortId ? `/todos/${shortPath(row.listShortId, row.listName ?? '')}` : '/todos',
    }
    for (const userId of recipients) {
      await send(userId, message)
      sent += 1
    }
  }
  return sent
}
