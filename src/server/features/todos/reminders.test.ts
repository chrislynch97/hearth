import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { member, membership, todoReminder, user } from '../../db/schema'
import type { PushMessage } from '../../notifications/push'
import { runTodoReminderPass, startTodoReminderScheduler } from './reminders'

type Db = Awaited<ReturnType<typeof makeTestDb>>

async function addLogin(db: Db, id: string, accepted = true) {
  const now = new Date()
  await db.insert(user).values({ id, username: id, displayName: id, createdAt: now, updatedAt: now })
  await db.insert(membership).values({
    id: `m-${id}`,
    userId: id,
    householdId: 'household',
    role: 'member',
    acceptedAt: accepted ? now : null,
    createdAt: now,
    updatedAt: now,
  })
}

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  await addLogin(db, 'ana')
  await addLogin(db, 'ben')
  const api = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
  const sent: Array<{ userId: string; message: PushMessage }> = []
  const send = async (userId: string, message: PushMessage) => {
    sent.push({ userId, message })
  }

  /** A to-do with one reminder already due. */
  const due = async (fields: { title: string; assigneeId?: string | null; listId?: string | null }) => {
    const created = await api.todos.create({ ...fields, reminders: [new Date(Date.now() + 3_600_000)] })
    await db.update(todoReminder).set({ remindAt: new Date(Date.now() - 1000) }).where(eq(todoReminder.todoId, created.id))
    return created
  }

  const recipients = () => sent.map((s) => s.userId).sort()

  return { db, api, send, sent, due, recipients }
}

async function linkedPerson(db: Db, userId: string) {
  const now = new Date()
  await db.insert(member).values({
    id: `person-${userId}`,
    householdId: 'household',
    userId,
    kind: 'person',
    displayName: userId,
    createdAt: now,
    updatedAt: now,
  })
  return `person-${userId}`
}

describe('runTodoReminderPass', () => {
  it('goes only to the assignee when they have a login here', async () => {
    const { db, send, due, recipients } = await setup()
    const assigneeId = await linkedPerson(db, 'ana')
    await due({ title: 'Book the florist', assigneeId })

    await runTodoReminderPass(db, new Date(), send)

    expect(recipients()).toEqual(['ana'])
  })

  it('goes to everyone in the household when nobody holds it', async () => {
    const { db, send, due, recipients } = await setup()
    await due({ title: 'Anyone' })

    await runTodoReminderPass(db, new Date(), send)

    expect(recipients()).toEqual(expect.arrayContaining(['ana', 'ben']))
  })

  it('falls back to everyone for an assignee no longer in the household', async () => {
    const { db, send, due, recipients } = await setup()
    const assigneeId = await linkedPerson(db, 'ana')
    await due({ title: 'Theirs', assigneeId })
    await db.delete(membership).where(eq(membership.userId, 'ana'))

    await runTodoReminderPass(db, new Date(), send)

    expect(recipients()).toContain('ben')
    expect(recipients()).not.toContain('ana')
  })

  it('skips someone whose invitation is still pending', async () => {
    const { db, send, due, recipients } = await setup()
    await addLogin(db, 'pending', false)
    await due({ title: 'Anyone' })

    await runTodoReminderPass(db, new Date(), send)

    expect(recipients()).not.toContain('pending')
  })

  it('sends once, however many passes run', async () => {
    const { db, send, sent, due } = await setup()
    const assigneeId = await linkedPerson(db, 'ana')
    await due({ title: 'Once', assigneeId })

    await runTodoReminderPass(db, new Date(), send)
    await runTodoReminderPass(db, new Date(), send)

    expect(sent).toHaveLength(1)
  })

  it('stays quiet for one still in the future', async () => {
    const { db, api, send, sent } = await setup()
    await api.todos.create({ title: 'Later', reminders: [new Date(Date.now() + 3_600_000)] })

    await runTodoReminderPass(db, new Date(), send)

    expect(sent).toEqual([])
  })

  it('never fires for a ticked to-do, even if it is un-ticked afterwards', async () => {
    const { db, api, send, sent, due } = await setup()
    const created = await due({ title: 'Done already' })
    await api.todos.complete({ id: created.id, done: true })

    await runTodoReminderPass(db, new Date(), send)
    await api.todos.complete({ id: created.id, done: false })
    await runTodoReminderPass(db, new Date(), send)

    expect(sent).toEqual([])
  })

  it('stays quiet for an archived to-do', async () => {
    const { db, api, send, sent, due } = await setup()
    const created = await due({ title: 'Removed' })
    await api.todos.archive({ id: created.id })

    await runTodoReminderPass(db, new Date(), send)

    expect(sent).toEqual([])
  })

  it('links back to the list it came from', async () => {
    const { db, api, send, sent, due } = await setup()
    const assigneeId = await linkedPerson(db, 'ana')
    const wedding = await api.todoLists.create({ name: 'Wedding' })
    await due({ title: 'Book the band', assigneeId, listId: wedding.id })

    await runTodoReminderPass(db, new Date(), send)

    expect(sent[0]?.message).toEqual({
      title: 'Book the band',
      body: 'Reminder from Wedding',
      url: `/todos/${wedding.slug}`,
    })
  })
})

describe('startTodoReminderScheduler', () => {
  it('leaves due reminders unclaimed while push is off', async () => {
    const { db, due } = await setup()
    await due({ title: 'Waits for push' })

    startTodoReminderScheduler(db)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const [reminder] = await db.select().from(todoReminder)
    expect(reminder?.sentAt).toBeNull()
  })
})
