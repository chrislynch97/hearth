import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { member, membership, user } from '../../db/schema'
import type { PushMessage } from '../../notifications/push'
import { runMaintenanceReminderPass } from './reminders'

type Db = Awaited<ReturnType<typeof makeTestDb>>

async function addLogin(db: Db, id: string) {
  const now = new Date()
  await db.insert(user).values({ id, username: id, displayName: id, createdAt: now, updatedAt: now })
  await db.insert(membership).values({
    id: `m-${id}`,
    userId: id,
    householdId: 'household',
    role: 'member',
    acceptedAt: now,
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
  const gutters = (assigneeId: string | null = null) =>
    api.maintenance.create({
      name: 'Clear the gutters',
      area: 'outside',
      notes: null,
      assigneeId,
      dueDate: '2026-12-14',
      repeatEvery: 12,
      repeatUnit: 'month',
      remindDays: 14,
    })
  return { db, api, send, sent, gutters }
}

describe('runMaintenanceReminderPass', () => {
  it('waits for the lead time, then sends once', async () => {
    const { db, send, sent, gutters } = await setup()
    await gutters()

    expect(await runMaintenanceReminderPass(db, '2026-11-29', send)).toBe(0)
    await runMaintenanceReminderPass(db, '2026-11-30', send)
    await runMaintenanceReminderPass(db, '2026-12-01', send)

    expect(sent.map((s) => s.userId)).toEqual(expect.arrayContaining(['ana', 'ben']))
    expect(new Set(sent.map((s) => s.message.title))).toEqual(new Set(['Clear the gutters is due 14 Dec 2026']))
    expect(sent[0]!.message.url).toBe('/maintenance')
  })

  it('goes only to whoever does it when they have a login here', async () => {
    const { db, send, sent, gutters } = await setup()
    const now = new Date()
    await db.insert(member).values({
      id: 'person-ana',
      householdId: 'household',
      userId: 'ana',
      kind: 'person',
      displayName: 'Ana',
      createdAt: now,
      updatedAt: now,
    })
    await gutters('person-ana')

    await runMaintenanceReminderPass(db, '2026-12-01', send)

    expect(sent.map((s) => s.userId)).toEqual(['ana'])
  })

  it('re-arms once the job is done and moves on', async () => {
    const { db, api, send, sent, gutters } = await setup()
    const job = await gutters()
    await runMaintenanceReminderPass(db, '2026-12-01', send)
    const first = sent.length

    await api.maintenance.done({ id: job.id, doneOn: '2026-12-10', doneById: null, amount: null, note: null })
    await runMaintenanceReminderPass(db, '2026-12-11', send)
    expect(sent.length).toBe(first)

    await runMaintenanceReminderPass(db, '2027-11-26', send)
    expect(sent.length).toBe(first * 2)
  })

  it('stays quiet for an archived job', async () => {
    const { db, api, send, gutters } = await setup()
    const job = await gutters()
    await api.maintenance.setArchived({ id: job.id, archived: true })

    expect(await runMaintenanceReminderPass(db, '2026-12-01', send)).toBe(0)
  })
})
