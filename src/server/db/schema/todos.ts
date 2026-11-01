import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'

// ---------------------------------------------------------------------------
// To-dos — one job per row, ticked off rather than deleted. A to-do sits in at
// most one list (a wedding); tags cut across lists. Recurrence, when it comes,
// adds columns to `todo` without changing these.
// ---------------------------------------------------------------------------

export const todoList = pgTable('todo_list', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  // Set on create and never changed: the stable part of the list's URL
  // (`/todos/k3x9p2-wedding`), so a rename can't break links.
  shortId: text('short_id').notNull(),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqShortId: uniqueIndex('todo_list_short_id').on(t.householdId, t.shortId),
  householdIdx: index('todo_list_household_id_idx').on(t.householdId),
}))

export const todo = pgTable('todo', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  listId: text('list_id').references(() => todoList.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  notes: text('notes'),
  priority: text('priority').notNull().default('normal'), // see shared/todos.ts
  // A member, not a user: the joint entity and people with no login can hold a job.
  assigneeId: text('assignee_id').references(() => member.id, { onDelete: 'set null' }),
  dueDate: text('due_date'),                     // YYYY-MM-DD, optional
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  completedById: text('completed_by_id').references(() => member.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('todo_household_id_idx').on(t.householdId),
  listIdx: index('todo_household_list_idx').on(t.householdId, t.listId),
}))

export const todoTag = pgTable('todo_tag', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqName: uniqueIndex('todo_tag_household_name').on(t.householdId, sql`lower(${t.name})`),
}))

export const todoTagLink = pgTable('todo_tag_link', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  todoId: text('todo_id').notNull().references(() => todo.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => todoTag.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  uniqPair: uniqueIndex('todo_tag_link_pair').on(t.todoId, t.tagId),
  tagIdx: index('todo_tag_link_tag_id_idx').on(t.tagId),
  householdIdx: index('todo_tag_link_household_id_idx').on(t.householdId),
}))

export const todoReminder = pgTable('todo_reminder', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  todoId: text('todo_id').notNull().references(() => todo.id, { onDelete: 'cascade' }),
  remindAt: timestamp('remind_at', { withTimezone: true, mode: 'date' }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('todo_reminder_household_id_idx').on(t.householdId),
  todoIdx: index('todo_reminder_todo_id_idx').on(t.todoId),
  // The reminder sweep's own query, across every household.
  dueIdx: index('todo_reminder_due_idx').on(t.remindAt).where(sql`${t.sentAt} is null`),
}))

export type TodoList = typeof todoList.$inferSelect
export type Todo = typeof todo.$inferSelect
export type TodoTag = typeof todoTag.$inferSelect
export type TodoReminder = typeof todoReminder.$inferSelect
