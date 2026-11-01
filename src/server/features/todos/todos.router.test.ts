import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { auditLog, household, member, todo, todoReminder, todoTag, user } from '../../db/schema'

type Db = Awaited<ReturnType<typeof makeTestDb>>

const caller = (db: Db, householdId = 'household', role: 'owner' | 'viewer' = 'owner') =>
  appRouter.createCaller({ db, householdId, role })

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  return { db, api: caller(db) }
}

/** A second household with one member of its own, for the cross-tenant checks. */
async function otherHousehold(db: Db) {
  const now = new Date()
  await db.insert(household).values({ id: 'other', displayName: 'Other', createdAt: now, updatedAt: now })
  await db.insert(member).values({
    id: 'other-member',
    householdId: 'other',
    kind: 'person',
    displayName: 'Nobody',
    createdAt: now,
    updatedAt: now,
  })
  return caller(db, 'other')
}

const later = (hours: number) => new Date(Date.now() + hours * 3_600_000)

describe('todos router', () => {
  it('lists a new to-do with its defaults, tags and reminders', async () => {
    const { api } = await setup()
    const remindAt = later(24)
    await api.todos.create({ title: 'Book the venue', tags: ['Venue'], reminders: [remindAt] })

    const [listed] = await api.todos.list()
    expect(listed).toMatchObject({ title: 'Book the venue', priority: 'normal', listId: null, completedAt: null })
    expect(listed?.tags).toEqual(['Venue'])
    expect(listed?.reminders.map((r) => r.remindAt)).toEqual([remindAt])
  })

  it('refuses an assignee or list from another household', async () => {
    const { db, api } = await setup()
    const other = await otherHousehold(db)
    const theirs = await other.todoLists.create({ name: 'Theirs' })

    await expect(api.todos.create({ title: 'No', assigneeId: 'other-member' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(api.todos.create({ title: 'No', listId: theirs.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('keeps households apart, by-id routes included', async () => {
    const { db, api } = await setup()
    const other = await otherHousehold(db)
    const mine = await api.todos.create({ title: 'Ours', tags: ['Shared name'] })
    await other.todos.create({ title: 'Theirs', tags: ['Shared name'] })

    expect((await api.todos.list()).map((t) => t.title)).toEqual(['Ours'])
    expect((await api.todos.list())[0]?.tags).toEqual(['Shared name'])
    await expect(other.todos.update({ id: mine.id, title: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(other.todos.complete({ id: mine.id, done: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(other.todos.archive({ id: mine.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a stale update and rolls its tags back', async () => {
    const { api } = await setup()
    const created = await api.todos.create({ title: 'First', tags: ['Keep'] })
    await api.todos.update({ id: created.id, expectedUpdatedAt: created.updatedAt, title: 'Second' })

    await expect(
      api.todos.update({ id: created.id, expectedUpdatedAt: created.updatedAt, title: 'Third', tags: ['Lost'] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await api.todos.list())[0]).toMatchObject({ title: 'Second', tags: ['Keep'] })
  })

  it('stamps who ticked it, and un-ticks', async () => {
    const { db } = await setup()
    const now = new Date()
    await db.insert(user).values({ id: 'u1', username: 'ticker', displayName: 'Ticker', createdAt: now, updatedAt: now })
    await db.insert(member).values({
      id: 'p1',
      householdId: 'household',
      userId: 'u1',
      kind: 'person',
      displayName: 'Ticker',
      createdAt: now,
      updatedAt: now,
    })
    const api = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: 'u1' })

    const created = await api.todos.create({ title: 'Tick me' })
    const ticked = await api.todos.complete({ id: created.id, done: true, expectedUpdatedAt: created.updatedAt })
    expect(ticked?.completedAt).toBeInstanceOf(Date)
    expect(ticked?.completedById).toBe('p1')

    const unticked = await api.todos.complete({ id: created.id, done: false, expectedUpdatedAt: ticked?.updatedAt })
    expect(unticked).toMatchObject({ completedAt: null, completedById: null })
  })

  it('lets two people tick the same to-do, but refuses a stale real change', async () => {
    const { api } = await setup()
    const created = await api.todos.create({ title: 'Together' })
    await api.todos.complete({ id: created.id, done: true, expectedUpdatedAt: created.updatedAt })

    await expect(api.todos.complete({ id: created.id, done: true, expectedUpdatedAt: created.updatedAt })).resolves.toBeDefined()
    await expect(
      api.todos.complete({ id: created.id, done: false, expectedUpdatedAt: created.updatedAt }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('archives one to-do, or the done ones of a single list', async () => {
    const { api } = await setup()
    const wedding = await api.todoLists.create({ name: 'Wedding' })
    const inList = await api.todos.create({ title: 'In list', listId: wedding.id })
    const outside = await api.todos.create({ title: 'Outside' })
    const gone = await api.todos.create({ title: 'Gone' })
    await api.todos.complete({ id: inList.id, done: true })
    await api.todos.complete({ id: outside.id, done: true })
    await api.todos.archive({ id: gone.id })

    expect(await api.todos.archiveCompleted({ listId: wedding.id })).toEqual({ archived: 1 })
    expect((await api.todos.list()).map((t) => t.title)).toEqual(['Outside'])
  })

  it('reads for a viewer but refuses their writes', async () => {
    const { db, api } = await setup()
    const created = await api.todos.create({ title: 'Look, no hands' })
    const viewer = caller(db, 'household', 'viewer')

    await expect(viewer.todos.list()).resolves.toHaveLength(1)
    await expect(viewer.todos.create({ title: 'No' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(viewer.todos.complete({ id: created.id, done: true })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('records an audit entry for each change', async () => {
    const { db, api } = await setup()
    const created = await api.todos.create({ title: 'Audited' })
    await api.todos.update({ id: created.id, title: 'Still audited' })
    await api.todos.archive({ id: created.id })

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id))
    expect(entries.map((e) => e.action).sort()).toEqual(['archive', 'create', 'update'])
  })
})

describe('todo tags', () => {
  it('reuses a tag whatever the case, keeping the first spelling', async () => {
    const { db, api } = await setup()
    await api.todos.create({ title: 'One', tags: ['Venue'] })
    await api.todos.create({ title: 'Two', tags: ['VENUE', ' venue '] })

    expect((await db.select().from(todoTag)).map((t) => t.name)).toEqual(['Venue'])
    expect((await api.todos.list()).map((t) => t.tags)).toEqual([['Venue'], ['Venue']])
  })

  it('drops a tag once nothing uses it, and leaves one still in use', async () => {
    const { db, api } = await setup()
    const one = await api.todos.create({ title: 'One', tags: ['Typo', 'Shared'] })
    await api.todos.create({ title: 'Two', tags: ['Shared'] })

    await api.todos.update({ id: one.id, tags: [] })

    expect((await db.select().from(todoTag)).map((t) => t.name)).toEqual(['Shared'])
  })

  it('leaves tags alone when an update does not mention them', async () => {
    const { api } = await setup()
    const created = await api.todos.create({ title: 'Tagged', tags: ['Keep'] })
    await api.todos.update({ id: created.id, title: 'Renamed' })

    expect((await api.todos.list())[0]?.tags).toEqual(['Keep'])
  })
})

describe('todo reminders', () => {
  it('holds several, and removes one that is taken off', async () => {
    const { api } = await setup()
    const week = later(24 * 7)
    const month = later(24 * 30)
    const created = await api.todos.create({ title: 'Twice', reminders: [week, month, week] })
    expect((await api.todos.list())[0]?.reminders.map((r) => r.remindAt)).toEqual([week, month])

    await api.todos.update({ id: created.id, reminders: [month] })
    expect((await api.todos.list())[0]?.reminders.map((r) => r.remindAt)).toEqual([month])
  })

  it('refuses a new reminder in the past', async () => {
    const { api } = await setup()

    await expect(api.todos.create({ title: 'Late', reminders: [later(-1)] })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await api.todos.list()).toEqual([])
  })

  it('keeps one already sent when the form saves it again', async () => {
    const { db, api } = await setup()
    const created = await api.todos.create({ title: 'Sent', reminders: [later(1)] })
    const past = later(-2)
    await db.update(todoReminder).set({ remindAt: past, sentAt: past }).where(eq(todoReminder.todoId, created.id))

    await api.todos.update({ id: created.id, reminders: [past, later(5)] })

    const rows = await db.select().from(todoReminder).where(eq(todoReminder.todoId, created.id))
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.remindAt.getTime() === past.getTime())?.sentAt).toEqual(past)
    expect((await db.select().from(todo)).length).toBe(1)
  })
})
