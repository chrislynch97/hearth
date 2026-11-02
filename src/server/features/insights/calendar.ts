import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { scopeWhere } from '../../trpc/tenant'
import { expense, savingsGoal, savingsItem, todo, todoList, vehicle, vehicleDate, maintenanceJob } from '../../db/schema'
import { projectUpcoming, type UpcomingExpenseInput } from '../budget/upcoming'
import type { DBOrTx } from '../../db/client'
import type { CalendarEvent } from '@shared/calendar'
import { goalPath } from '@shared/savings'
import { shortPath } from '@shared/slug'
import { vehicleDateName } from '@shared/vehicles'

/** Everything with a date between `from` and `to`, inclusive, soonest first.
 *  Finished things stay off it: ticked to-dos and paid savings items. */
export async function loadCalendar(db: DBOrTx, householdId: string, from: string, to: string): Promise<CalendarEvent[]> {
  const [bills, todos, goals, items, vehicleDates, jobs] = await Promise.all([
    db
      .select()
      .from(expense)
      .where(scopeWhere(householdId, expense.householdId, isNull(expense.archivedAt), eq(expense.active, 1))),
    db
      .select({
        id: todo.id,
        title: todo.title,
        dueDate: todo.dueDate,
        shortId: todoList.shortId,
        listName: todoList.name,
      })
      .from(todo)
      .leftJoin(todoList, eq(todo.listId, todoList.id))
      .where(
        scopeWhere(
          householdId,
          todo.householdId,
          isNull(todo.archivedAt),
          isNull(todo.completedAt),
          gte(todo.dueDate, from),
          lte(todo.dueDate, to),
        ),
      ),
    db
      .select()
      .from(savingsGoal)
      .where(
        scopeWhere(
          householdId,
          savingsGoal.householdId,
          isNull(savingsGoal.archivedAt),
          and(isNotNull(savingsGoal.targetDate), gte(savingsGoal.targetDate, from), lte(savingsGoal.targetDate, to)),
        ),
      ),
    db
      .select({
        id: savingsItem.id,
        name: savingsItem.name,
        amount: savingsItem.amount,
        dueDate: savingsItem.dueDate,
        shortId: savingsGoal.shortId,
        goalName: savingsGoal.name,
      })
      .from(savingsItem)
      .innerJoin(savingsGoal, eq(savingsItem.goalId, savingsGoal.id))
      .where(
        scopeWhere(
          householdId,
          savingsItem.householdId,
          isNull(savingsGoal.archivedAt),
          isNull(savingsItem.paidOn),
          gte(savingsItem.dueDate, from),
          lte(savingsItem.dueDate, to),
        ),
      ),
    db
      .select({
        id: vehicleDate.id,
        kind: vehicleDate.kind,
        label: vehicleDate.label,
        dueDate: vehicleDate.dueDate,
        shortId: vehicle.shortId,
        vehicleName: vehicle.name,
      })
      .from(vehicleDate)
      .innerJoin(vehicle, eq(vehicleDate.vehicleId, vehicle.id))
      .where(
        scopeWhere(
          householdId,
          vehicleDate.householdId,
          isNull(vehicle.archivedAt),
          gte(vehicleDate.dueDate, from),
          lte(vehicleDate.dueDate, to),
        ),
      ),
    db
      .select({ id: maintenanceJob.id, name: maintenanceJob.name, dueDate: maintenanceJob.dueDate })
      .from(maintenanceJob)
      .where(
        scopeWhere(
          householdId,
          maintenanceJob.householdId,
          isNull(maintenanceJob.archivedAt),
          gte(maintenanceJob.dueDate, from),
          lte(maintenanceJob.dueDate, to),
        ),
      ),
  ])

  const upcoming: UpcomingExpenseInput[] = bills.map((bill) => ({
    id: bill.id,
    name: bill.name,
    recurrence: bill.recurrence as UpcomingExpenseInput['recurrence'],
    dueAnchor: bill.dueAnchor,
    amount: bill.amount ?? 0,
    reminderDays: bill.dueReminderDays,
  }))

  const events: CalendarEvent[] = [
    ...projectUpcoming({ expenses: upcoming, from, to }).map((payment) => ({
      id: `bill:${payment.expenseId}:${payment.date}`,
      kind: 'bill' as const,
      date: payment.date,
      title: payment.name,
      amount: payment.amount,
      href: '/upcoming',
    })),
    ...todos.map((row) => ({
      id: `todo:${row.id}`,
      kind: 'todo' as const,
      date: row.dueDate!,
      title: row.title,
      amount: null,
      href: row.shortId ? `/todos/${shortPath(row.shortId, row.listName ?? '')}` : '/todos',
    })),
    ...goals.map((row) => ({
      id: `goal:${row.id}`,
      kind: 'savings' as const,
      date: row.targetDate!,
      title: row.name,
      amount: row.targetAmount,
      href: `/planners/${goalPath(row.shortId, row.name)}`,
    })),
    ...items.map((row) => ({
      id: `item:${row.id}`,
      kind: 'savings' as const,
      date: row.dueDate!,
      title: row.name,
      amount: row.amount,
      href: `/planners/${goalPath(row.shortId, row.goalName)}`,
    })),
    ...vehicleDates.map((row) => ({
      id: `vehicle:${row.id}`,
      kind: 'vehicle' as const,
      date: row.dueDate,
      title: `${vehicleDateName(row.kind, row.label)} · ${row.vehicleName}`,
      amount: null,
      href: `/vehicles/${shortPath(row.shortId, row.vehicleName)}`,
    })),
    ...jobs.map((row) => ({
      id: `maintenance:${row.id}`,
      kind: 'maintenance' as const,
      date: row.dueDate,
      title: row.name,
      amount: null,
      href: '/maintenance',
    })),
  ]

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}
