import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { expense, household } from '../../db/schema'

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const now = new Date()
  await db.insert(household).values({ id: 'other', displayName: 'Other', createdAt: now, updatedAt: now })
  await db.insert(expense).values({
    id: 'insurance',
    householdId: 'household',
    name: 'Car insurance',
    amount: 4500,
    recurrence: 'monthly',
    funding: 'main',
    createdAt: now,
    updatedAt: now,
  })
  return {
    api: appRouter.createCaller({ db, householdId: 'household', role: 'owner' }),
    other: appRouter.createCaller({ db, householdId: 'other', role: 'owner' }),
    viewer: appRouter.createCaller({ db, householdId: 'household', role: 'viewer' }),
  }
}

const mot = (vehicleId: string, repeatMonths: number | null = 12) => ({
  vehicleId,
  kind: 'mot' as const,
  label: null,
  dueDate: '2026-12-14',
  repeatMonths,
  remindDays: 14,
})

describe('vehicles router', () => {
  it('keeps a vehicle with its dates, costs and linked bills', async () => {
    const { api } = await setup()
    const van = await api.vehicles.create({ name: 'Camper', kind: 'campervan', registration: 'ab12 cde', ownerId: null })
    expect(van.slug).toMatch(/^[0-9a-z]{6}-camper$/)
    expect(van.registration).toBe('AB12 CDE')

    await api.vehicles.dates.create(mot(van.id))
    await api.vehicles.costs.create({ vehicleId: van.id, kind: 'tyres', date: '2026-03-01', amount: 32000, note: 'Front pair' })
    await api.vehicles.bills.link({ vehicleId: van.id, expenseId: 'insurance' })

    const [listed] = await api.vehicles.list()
    expect(listed!.kind).toBe('campervan')
    expect(listed!.dates.map((d) => d.name)).toEqual(['MOT'])
    expect(listed!.costs.map((c) => c.amount)).toEqual([32000])
    expect(listed!.bills).toEqual([
      expect.objectContaining({ id: 'insurance', annual: 54000, archived: false }),
    ])
  })

  it('moves a bill between vehicles rather than doubling it', async () => {
    const { api } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    const bike = await api.vehicles.create({ name: 'Bike', kind: 'motorbike', registration: null, ownerId: null })
    await api.vehicles.bills.link({ vehicleId: car.id, expenseId: 'insurance' })
    await api.vehicles.bills.link({ vehicleId: bike.id, expenseId: 'insurance' })

    const list = await api.vehicles.list()
    expect(list.find((v) => v.id === car.id)!.bills).toEqual([])
    expect(list.find((v) => v.id === bike.id)!.bills).toHaveLength(1)

    await api.vehicles.bills.unlink({ expenseId: 'insurance' })
    expect((await api.vehicles.list()).every((v) => v.bills.length === 0)).toBe(true)
  })

  it('logs the cost and rolls a repeating date on a year when it is done', async () => {
    const { api } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    const date = await api.vehicles.dates.create(mot(car.id))
    await api.vehicles.dates.done({ id: date.id, doneOn: '2026-12-01', amount: 5485, note: null })

    const [listed] = await api.vehicles.list()
    expect(listed!.dates[0]!.dueDate).toBe('2027-12-14')
    expect(listed!.costs).toEqual([expect.objectContaining({ kind: 'mot', date: '2026-12-01', amount: 5485 })])
  })

  it('refuses a second done from the same stale copy', async () => {
    const { api } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    const date = await api.vehicles.dates.create(mot(car.id))
    const done = { id: date.id, expectedUpdatedAt: date.updatedAt, doneOn: '2026-12-01', amount: 5485, note: null }
    await api.vehicles.dates.done(done)
    await expect(api.vehicles.dates.done(done)).rejects.toThrow('changed by someone else')

    const [listed] = await api.vehicles.list()
    expect(listed!.dates[0]!.dueDate).toBe('2027-12-14')
    expect(listed!.costs).toHaveLength(1)
  })

  it('finishes a one-off date without a cost', async () => {
    const { api } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    const date = await api.vehicles.dates.create({ ...mot(car.id, null), kind: 'other', label: 'Recall fix' })
    await api.vehicles.dates.done({ id: date.id, doneOn: '2026-12-01', amount: null, note: null })

    const [listed] = await api.vehicles.list()
    expect(listed!.dates).toEqual([])
    expect(listed!.costs).toEqual([])
  })

  it('keeps households apart and viewers read-only', async () => {
    const { api, other, viewer } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    const date = await api.vehicles.dates.create(mot(car.id))

    expect(await other.vehicles.list()).toEqual([])
    await expect(other.vehicles.dates.create(mot(car.id))).rejects.toThrow('no longer exists')
    await expect(other.vehicles.dates.remove({ id: date.id })).rejects.toThrow('not found')
    const theirs = await other.vehicles.create({ name: 'Theirs', kind: 'car', registration: null, ownerId: null })
    await expect(other.vehicles.bills.link({ vehicleId: theirs.id, expenseId: 'insurance' })).rejects.toThrow(
      'no longer exists',
    )
    await expect(viewer.vehicles.create({ name: 'X', kind: 'car', registration: null, ownerId: null })).rejects.toThrow()
  })

  it('puts vehicle dates on the home calendar', async () => {
    const { api } = await setup()
    const car = await api.vehicles.create({ name: 'Golf', kind: 'car', registration: null, ownerId: null })
    await api.vehicles.dates.create(mot(car.id))

    const events = await api.dashboard.calendar({ from: '2026-12-01', to: '2026-12-31' })
    expect(events.filter((e) => e.kind === 'vehicle')).toEqual([
      expect.objectContaining({ title: 'MOT · Golf', date: '2026-12-14', href: `/vehicles/${car.slug}` }),
    ])
  })
})
