import { z } from 'zod'
import { asc, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { actingMemberId, assertMember, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { todo, todoList, todoReminder, todoTag, todoTagLink } from '../../db/schema'
import type { Todo, TodoReminder } from '../../db/schema'
import { newId } from '@shared/ids'
import { PRIORITIES } from '@shared/priority'
import { MAX_TAGS, MAX_TAG_LENGTH, cleanTagNames } from '@shared/tags'
import { MAX_REMINDERS_PER_TODO } from '@shared/todos'
import type { DBOrTx, Tx } from '../../db/client'

const PRIORITY = z.enum(PRIORITIES)
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const TAGS = z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS)
const REMINDERS = z.array(z.date()).max(MAX_REMINDERS_PER_TODO)

export interface TodoWithDetails extends Todo {
  tags: string[]
  reminders: Array<Pick<TodoReminder, 'id' | 'remindAt' | 'sentAt'>>
}

/** A guessed id from another household must not file a to-do under their list. */
async function assertList(db: DBOrTx, householdId: string, listId: string): Promise<void> {
  const [row] = await db
    .select({ id: todoList.id })
    .from(todoList)
    .where(scopeWhere(householdId, todoList.householdId, eq(todoList.id, listId)))
  if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That list no longer exists.' })
}

/** Makes a to-do's tags exactly `names`, creating new ones and dropping any left
 *  on nothing, so a typo disappears once it's taken off. */
async function setTags(tx: Tx, householdId: string, todoId: string, names: string[], now: Date): Promise<void> {
  const wanted = cleanTagNames(names)
  const stamps = { householdId, createdAt: now, updatedAt: now }
  if (wanted.length > 0) {
    await tx
      .insert(todoTag)
      .values(wanted.map((name) => ({ id: newId(), name, ...stamps })))
      .onConflictDoNothing()
  }
  const tags =
    wanted.length === 0
      ? []
      : await tx
          .select({ id: todoTag.id })
          .from(todoTag)
          .where(
            scopeWhere(
              householdId,
              todoTag.householdId,
              inArray(
                sql`lower(${todoTag.name})`,
                wanted.map((name) => name.toLowerCase()),
              ),
            ),
          )

  await tx.delete(todoTagLink).where(scopeWhere(householdId, todoTagLink.householdId, eq(todoTagLink.todoId, todoId)))
  if (tags.length > 0) {
    await tx.insert(todoTagLink).values(tags.map((tag) => ({ id: newId(), todoId, tagId: tag.id, ...stamps })))
  }
  await tx
    .delete(todoTag)
    .where(
      scopeWhere(
        householdId,
        todoTag.householdId,
        notExists(tx.select({ id: todoTagLink.id }).from(todoTagLink).where(eq(todoTagLink.tagId, todoTag.id))),
      ),
    )
}

/** Makes a to-do's reminders exactly `times`. One that already exists is kept, so
 *  saving the form doesn't re-arm what has been sent. */
async function setReminders(tx: Tx, householdId: string, todoId: string, times: Date[], now: Date): Promise<void> {
  const unique = [...new Set(times.map((time) => time.getTime()))]
  const existing = await tx
    .select({ id: todoReminder.id, remindAt: todoReminder.remindAt })
    .from(todoReminder)
    .where(scopeWhere(householdId, todoReminder.householdId, eq(todoReminder.todoId, todoId)))

  const stale = existing.filter((row) => !unique.includes(row.remindAt.getTime())).map((row) => row.id)
  if (stale.length > 0) {
    await tx.delete(todoReminder).where(scopeWhere(householdId, todoReminder.householdId, inArray(todoReminder.id, stale)))
  }

  const added = unique.filter((time) => !existing.some((row) => row.remindAt.getTime() === time))
  if (added.some((time) => time <= now.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a reminder time in the future.' })
  }
  if (added.length > 0) {
    await tx.insert(todoReminder).values(
      added.map((time) => ({
        id: newId(),
        householdId,
        todoId,
        remindAt: new Date(time),
        createdAt: now,
        updatedAt: now,
      })),
    )
  }
}

export const todosRouter = router({
  /** Every live to-do, done ones included; the page filters and sorts. */
  list: publicProcedure.query(async ({ ctx }): Promise<TodoWithDetails[]> => {
    const rows = await ctx.db
      .select()
      .from(todo)
      .where(scopeWhere(ctx.householdId, todo.householdId, isNull(todo.archivedAt)))
      .orderBy(asc(todo.createdAt))
    const tags = await ctx.db
      .select({ todoId: todoTagLink.todoId, name: todoTag.name })
      .from(todoTagLink)
      .innerJoin(todoTag, eq(todoTagLink.tagId, todoTag.id))
      .where(scopeWhere(ctx.householdId, todoTagLink.householdId))
      .orderBy(asc(todoTag.name))
    const reminders = await ctx.db
      .select({
        id: todoReminder.id,
        todoId: todoReminder.todoId,
        remindAt: todoReminder.remindAt,
        sentAt: todoReminder.sentAt,
      })
      .from(todoReminder)
      .where(scopeWhere(ctx.householdId, todoReminder.householdId))
      .orderBy(asc(todoReminder.remindAt))

    return rows.map((row) => ({
      ...row,
      tags: tags.filter((tag) => tag.todoId === row.id).map((tag) => tag.name),
      reminders: reminders
        .filter((reminder) => reminder.todoId === row.id)
        .map(({ id, remindAt, sentAt }) => ({ id, remindAt, sentAt })),
    }))
  }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        notes: z.string().max(2000).nullable().optional(),
        priority: PRIORITY.optional(),
        assigneeId: z.string().nullable().optional(),
        dueDate: DATE.nullable().optional(),
        listId: z.string().nullable().optional(),
        tags: TAGS.optional(),
        reminders: REMINDERS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tags = [], reminders = [], ...fields } = input
      if (fields.assigneeId) await assertMember(ctx.db, ctx.householdId, fields.assigneeId)
      if (fields.listId) await assertList(ctx.db, ctx.householdId, fields.listId)

      const now = new Date()
      const id = newId()
      const inserted = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(todo)
          .values({ ...fields, id, householdId: ctx.householdId, createdAt: now, updatedAt: now })
          .returning()
        await setTags(tx, ctx.householdId, id, tags, now)
        await setReminders(tx, ctx.householdId, id, reminders, now)
        return row!
      })
      recordAudit(ctx, { entityType: 'todo', entityId: id, action: 'create', after: inserted })
      return inserted
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        title: z.string().trim().min(1).max(200).optional(),
        notes: z.string().max(2000).nullable().optional(),
        priority: PRIORITY.optional(),
        assigneeId: z.string().nullable().optional(),
        dueDate: DATE.nullable().optional(),
        listId: z.string().nullable().optional(),
        tags: TAGS.optional(),
        reminders: REMINDERS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, tags, reminders, ...fields } = input
      if (fields.assigneeId) await assertMember(ctx.db, ctx.householdId, fields.assigneeId)
      if (fields.listId) await assertList(ctx.db, ctx.householdId, fields.listId)

      const [before] = await ctx.db
        .select()
        .from(todo)
        .where(scopeWhere(ctx.householdId, todo.householdId, eq(todo.id, id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'To-do not found' })

      const now = new Date()
      const updated = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(todo)
          .set({ ...fields, updatedAt: now })
          .where(
            scopeWhere(
              ctx.householdId,
              todo.householdId,
              eq(todo.id, id),
              versionGuard(todo.updatedAt, expectedUpdatedAt),
            ),
          )
          .returning()
        if (!row) throwStaleWrite('To-do', true)
        if (tags) await setTags(tx, ctx.householdId, id, tags, now)
        if (reminders) await setReminders(tx, ctx.householdId, id, reminders, now)
        return row
      })
      recordAudit(ctx, { entityType: 'todo', entityId: id, action: 'update', before, after: updated })
      return updated
    }),

  /** Tick or un-tick. Asking for the state it's already in returns it unchanged:
   *  two people ticking the same box agree, so there's no conflict to raise. */
  complete: publicProcedure
    .input(z.object({ id: z.string(), done: z.boolean(), expectedUpdatedAt: expectedUpdatedAtInput }))
    .mutation(async ({ ctx, input }) => {
      const [before] = await ctx.db
        .select()
        .from(todo)
        .where(scopeWhere(ctx.householdId, todo.householdId, eq(todo.id, input.id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'To-do not found' })
      if ((before.completedAt !== null) === input.done) return before

      const now = new Date()
      const completedById = input.done ? await actingMemberId(ctx.db, ctx.householdId, ctx.userId) : null
      const [updated] = await ctx.db
        .update(todo)
        .set({ completedAt: input.done ? now : null, completedById, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            todo.householdId,
            eq(todo.id, input.id),
            versionGuard(todo.updatedAt, input.expectedUpdatedAt),
          ),
        )
        .returning()
      if (updated) {
        recordAudit(ctx, { entityType: 'todo', entityId: input.id, action: 'update', before, after: updated })
        return updated
      }
      throwStaleWrite('To-do', true)
    }),

  /** Archived rather than deleted, so the audit trail still has something to name. */
  archive: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const [before] = await ctx.db
      .select()
      .from(todo)
      .where(scopeWhere(ctx.householdId, todo.householdId, eq(todo.id, input.id)))
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'To-do not found' })

    const now = new Date()
    await ctx.db
      .update(todo)
      .set({ archivedAt: before.archivedAt ?? now, updatedAt: now })
      .where(scopeWhere(ctx.householdId, todo.householdId, eq(todo.id, input.id)))
    recordAudit(ctx, { entityType: 'todo', entityId: input.id, action: 'archive', before })
  }),

  /** Clears ticked-off to-dos, from one list or from all of them. */
  archiveCompleted: publicProcedure
    .input(z.object({ listId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const done = await ctx.db
        .select()
        .from(todo)
        .where(
          scopeWhere(
            ctx.householdId,
            todo.householdId,
            isNull(todo.archivedAt),
            isNotNull(todo.completedAt),
            input.listId ? eq(todo.listId, input.listId) : undefined,
          ),
        )
      if (done.length === 0) return { archived: 0 }

      const now = new Date()
      await ctx.db
        .update(todo)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            todo.householdId,
            inArray(
              todo.id,
              done.map((row) => row.id),
            ),
          ),
        )
      for (const row of done) {
        recordAudit(ctx, { entityType: 'todo', entityId: row.id, action: 'archive', before: row })
      }
      return { archived: done.length }
    }),
})
