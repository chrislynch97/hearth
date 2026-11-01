import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { household } from '../../db/schema'

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const now = new Date()
  await db.insert(household).values({ id: 'other', displayName: 'Other', createdAt: now, updatedAt: now })
  return {
    api: appRouter.createCaller({ db, householdId: 'household', role: 'owner' }),
    other: appRouter.createCaller({ db, householdId: 'other', role: 'owner' }),
    viewer: appRouter.createCaller({ db, householdId: 'household', role: 'viewer' }),
  }
}

describe('todoLists router', () => {
  it('reports how far through a list is and what is next', async () => {
    const { api } = await setup()
    const wedding = await api.todoLists.create({ name: 'Wedding' })
    const done = await api.todos.create({ title: 'Venue', listId: wedding.id, dueDate: '2026-01-01' })
    await api.todos.complete({ id: done.id, done: true })
    await api.todos.create({ title: 'Cake', listId: wedding.id, dueDate: '2026-06-01' })
    await api.todos.create({ title: 'Flowers', listId: wedding.id, dueDate: '2026-03-01' })
    await api.todos.create({ title: 'Speeches', listId: wedding.id })
    await api.todos.create({ title: 'Not on the list', dueDate: '2025-01-01' })

    const [summary] = await api.todoLists.list()
    expect(summary).toMatchObject({ total: 4, done: 1, next: { title: 'Flowers', dueDate: '2026-03-01' } })
  })

  it('leaves archived to-dos out of the count', async () => {
    const { api } = await setup()
    const list = await api.todoLists.create({ name: 'Shopping' })
    const gone = await api.todos.create({ title: 'Gone', listId: list.id })
    await api.todos.archive({ id: gone.id })

    expect((await api.todoLists.list())[0]).toMatchObject({ total: 0, done: 0, next: null })
  })

  it('renames under an optimistic lock', async () => {
    const { api } = await setup()
    const list = await api.todoLists.create({ name: 'Wedding' })
    const renamed = await api.todoLists.update({ id: list.id, expectedUpdatedAt: list.updatedAt, name: 'Our wedding' })

    expect(renamed?.name).toBe('Our wedding')
    await expect(
      api.todoLists.update({ id: list.id, expectedUpdatedAt: list.updatedAt, name: 'Stale' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('archives a list and its to-dos stay, and it can come back', async () => {
    const { api } = await setup()
    const list = await api.todoLists.create({ name: 'Wedding' })
    await api.todos.create({ title: 'Still here', listId: list.id })

    const archived = await api.todoLists.update({ id: list.id, archived: true })
    expect(archived?.archivedAt).toBeInstanceOf(Date)
    expect(await api.todos.list()).toHaveLength(1)

    const restored = await api.todoLists.update({ id: list.id, archived: false })
    expect(restored?.archivedAt).toBeNull()
  })

  it('keeps households apart', async () => {
    const { api, other } = await setup()
    const list = await api.todoLists.create({ name: 'Ours' })

    expect(await other.todoLists.list()).toEqual([])
    await expect(other.todoLists.update({ id: list.id, name: 'Theirs' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a write from a viewer', async () => {
    const { viewer } = await setup()

    await expect(viewer.todoLists.create({ name: 'No' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
