import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { todo, todoList } from '../../db/schema'
import type { TodoList } from '../../db/schema'
import { newId } from '@shared/ids'
import { shortPath } from '@shared/slug'
import { newShortId } from '../savings/savings'

const NAME = z.string().trim().min(1).max(100)

export interface TodoListSummary extends TodoList {
  /** Its URL segment, `k3x9p2-wedding`. */
  slug: string
  total: number
  done: number
  /** The soonest deadline among what's still open, if any has one. */
  next: { title: string; dueDate: string } | null
}

export const todoListsRouter = router({
  /** Every list, archived included, with how far through it the household is. */
  list: publicProcedure.query(async ({ ctx }): Promise<TodoListSummary[]> => {
    const lists = await ctx.db
      .select()
      .from(todoList)
      .where(scopeWhere(ctx.householdId, todoList.householdId))
      .orderBy(asc(todoList.createdAt))
    const todos = await ctx.db
      .select({
        listId: todo.listId,
        title: todo.title,
        dueDate: todo.dueDate,
        completedAt: todo.completedAt,
      })
      .from(todo)
      .where(scopeWhere(ctx.householdId, todo.householdId, isNull(todo.archivedAt)))

    return lists.map((list) => {
      const own = todos.filter((t) => t.listId === list.id)
      const open = own.filter((t) => t.completedAt === null)
      let next: TodoListSummary['next'] = null
      for (const { title, dueDate } of open) {
        if (dueDate && (!next || dueDate < next.dueDate)) next = { title, dueDate }
      }
      return { ...list, slug: shortPath(list.shortId, list.name), total: own.length, done: own.length - open.length, next }
    })
  }),

  create: publicProcedure.input(z.object({ name: NAME })).mutation(async ({ ctx, input }) => {
    const now = new Date()
    const id = newId()
    const taken = await ctx.db
      .select({ shortId: todoList.shortId })
      .from(todoList)
      .where(scopeWhere(ctx.householdId, todoList.householdId))
    const shortId = newShortId(new Set(taken.map((t) => t.shortId)))
    const [inserted] = await ctx.db
      .insert(todoList)
      .values({ id, householdId: ctx.householdId, shortId, name: input.name, createdAt: now, updatedAt: now })
      .returning()
    recordAudit(ctx, { entityType: 'todoList', entityId: id, action: 'create', after: inserted })
    return { ...inserted!, slug: shortPath(shortId, input.name) }
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: NAME.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, name, archived } = input
      const now = new Date()
      const [before] = await ctx.db
        .select()
        .from(todoList)
        .where(scopeWhere(ctx.householdId, todoList.householdId, eq(todoList.id, id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' })

      const archiving = archived === undefined ? {} : { archivedAt: archived ? (before.archivedAt ?? now) : null }
      const [updated] = await ctx.db
        .update(todoList)
        .set({ ...(name === undefined ? {} : { name }), ...archiving, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            todoList.householdId,
            eq(todoList.id, id),
            versionGuard(todoList.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
      if (updated) {
        const action = archived && !before.archivedAt ? 'archive' : 'update'
        recordAudit(ctx, { entityType: 'todoList', entityId: id, action, before, after: updated })
        return updated
      }
      throwStaleWrite('List', true)
    }),
})
