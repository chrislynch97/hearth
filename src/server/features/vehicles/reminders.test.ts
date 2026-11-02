import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { member, membership, user, vehicleDate } from '../../db/schema'
import type { PushMessage } from '../../notifications/push'
import { runVehicleReminderPass } from './reminders'

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
  const motFor = async (ownerId: string | null = null) => {
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId })
    const date = await api.vehicles.dates.create({
      vehicleId: car.id,
      kind: 'mot',
      label: null,
      dueDate: '2026-12-14',
      repeatMonths: 12,
      remindDays: 14,
    })
    return { car, date }
  }
  return { db, api, send, sent, motFor }
}

describe('runVehicleReminderPass', () => {
  it('waits for the lead time, then sends once', async () => {
    const { db, send, sent, motFor } = await setup()
    const { car } = await motFor()

    expect(await runVehicleReminderPass(db, '2026-11-29', send)).toBe(0)
    await runVehicleReminderPass(db, '2026-11-30', send)
    await runVehicleReminderPass(db, '2026-12-01', send)

    expect(sent.map((s) => s.userId).sort()).toEqual(expect.arrayContaining(['ana', 'ben']))
    expect(new Set(sent.map((s) => s.message.title))).toEqual(new Set(['Golf: MOT is due 14 Dec 2026']))
    expect(sent[0]!.message.url).toBe(`/vehicles/${car.slug}`)
  })

  it('goes only to the owner when they have a login here', async () => {
    const { db, send, sent, motFor } = await setup()
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
    await motFor('person-ana')

    await runVehicleReminderPass(db, '2026-12-01', send)

    expect(sent.map((s) => s.userId)).toEqual(['ana'])
  })

  it('re-arms once the date moves on', async () => {
    const { db, api, send, sent, motFor } = await setup()
    const { date } = await motFor()
    await runVehicleReminderPass(db, '2026-12-01', send)
    const first = sent.length

    await api.vehicles.dates.done({ id: date.id, doneOn: '2026-12-10', amount: null, note: null })
    await runVehicleReminderPass(db, '2026-12-11', send)
    expect(sent.length).toBe(first)

    await runVehicleReminderPass(db, '2027-11-30', send)
    expect(sent.length).toBe(first * 2)
    const [row] = await db.select().from(vehicleDate).where(eq(vehicleDate.id, date.id))
    expect(row!.remindedFor).toBe('2027-12-14')
  })

  it('claims a long-past date without nudging about it', async () => {
    const { db, send, sent, motFor } = await setup()
    await motFor()

    await runVehicleReminderPass(db, '2027-01-20', send)
    await runVehicleReminderPass(db, '2027-01-21', send)
    expect(sent).toEqual([])
  })

  it('stays quiet for an archived vehicle', async () => {
    const { db, api, send, motFor } = await setup()
    const { car } = await motFor()
    await api.vehicles.update({ id: car.id, archived: true })

    expect(await runVehicleReminderPass(db, '2026-12-01', send)).toBe(0)
  })
})
