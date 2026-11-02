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

const boiler = (repeatEvery: number | null = 12) => ({
  name: 'Boiler service',
  area: 'heating' as const,
  notes: null,
  assigneeId: null,
  dueDate: '2026-10-01',
  repeatEvery,
  repeatUnit: 'month' as const,
  remindDays: 30,
})

describe('maintenance router', () => {
  it('moves a job on from the day it was done, and logs it', async () => {
    const { api } = await setup()
    const job = await api.maintenance.create(boiler())

    await api.maintenance.done({
      id: job.id,
      expectedUpdatedAt: job.updatedAt,
      doneOn: '2026-11-15',
      doneById: null,
      amount: 9500,
      note: 'New pressure valve',
    })

    const [after] = await api.maintenance.list()
    expect(after!.dueDate).toBe('2027-11-15')
    expect(after!.archivedAt).toBeNull()
    expect(after!.log.map((e) => [e.doneOn, e.amount, e.note])).toEqual([['2026-11-15', 9500, 'New pressure valve']])
  })

  it('counts weeks as well as months', async () => {
    const { api } = await setup()
    const job = await api.maintenance.create({ ...boiler(2), repeatUnit: 'week' })

    await api.maintenance.done({ id: job.id, doneOn: '2026-11-02', doneById: null, amount: null, note: null })

    const [after] = await api.maintenance.list()
    expect(after!.dueDate).toBe('2026-11-16')
  })

  it('archives a one-off once done, keeping its log', async () => {
    const { api } = await setup()
    const job = await api.maintenance.create(boiler(null))

    await api.maintenance.done({ id: job.id, doneOn: '2026-11-02', doneById: null, amount: null, note: null })

    const [after] = await api.maintenance.list()
    expect(after!.archivedAt).not.toBeNull()
    expect(after!.log).toHaveLength(1)
  })

  it('refuses a stale second tick', async () => {
    const { api } = await setup()
    const job = await api.maintenance.create(boiler())
    const tick = { id: job.id, expectedUpdatedAt: job.updatedAt, doneOn: '2026-11-02', doneById: null, amount: null, note: null }

    await api.maintenance.done(tick)
    await expect(api.maintenance.done(tick)).rejects.toThrow()
    const [after] = await api.maintenance.list()
    expect(after!.log).toHaveLength(1)
  })

  it('adds starters once, skipping names already listed', async () => {
    const { api } = await setup()
    await api.maintenance.create(boiler())

    expect(await api.maintenance.addStarters({ names: ['Boiler service', 'Clear the gutters', 'Not a starter'] })).toBe(1)
    expect((await api.maintenance.list()).map((j) => j.name).sort()).toEqual(['Boiler service', 'Clear the gutters'])
  })

  it('keeps households apart and viewers read-only', async () => {
    const { api, other, viewer } = await setup()
    const job = await api.maintenance.create(boiler())

    expect(await other.maintenance.list()).toEqual([])
    await expect(other.maintenance.remove({ id: job.id })).rejects.toThrow()
    await expect(other.maintenance.create({ ...boiler(), assigneeId: 'person-ava' })).rejects.toThrow()
    await expect(viewer.maintenance.create(boiler())).rejects.toThrow()
    expect(await viewer.maintenance.list()).toHaveLength(1)
  })
})
