import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('pots router', () => {
  it('create with valid ownerId → list returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    // Use the seeded joint member as ownerId
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Emergency Fund', ownerId: joint.id })

    expect(p.id).toBeTruthy()
    expect(p.name).toBe('Emergency Fund')
    expect(p.ownerId).toBe(joint.id)
    expect(p.archivedAt).toBeNull()

    const list = await caller.pots.list()
    expect(list.length).toBe(1)
    expect(list[0]?.name).toBe('Emergency Fund')
  })

  it('create with bogus ownerId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    await expect(
      caller.pots.create({ name: 'Bad Pot', ownerId: 'does-not-exist' }),
    ).rejects.toThrow(TRPCError)
    await expect(
      caller.pots.create({ name: 'Bad Pot', ownerId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('isDrawdown boolean persists correctly', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const drawdown = await caller.pots.create({ name: 'Holiday', ownerId: joint.id, isDrawdown: true })
    const regular = await caller.pots.create({ name: 'Savings', ownerId: joint.id, isDrawdown: false })

    expect(drawdown.isDrawdown).toBe(1)
    expect(regular.isDrawdown).toBe(0)
  })

  it('create without isDrawdown defaults to 0', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Default Pot', ownerId: joint.id })
    expect(p.isDrawdown).toBe(0)
  })

  it('create sets categoryId and note', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const cat = await caller.categories.create({ name: 'Living' })

    const p = await caller.pots.create({
      name: 'Rent',
      ownerId: joint.id,
      categoryId: cat.id,
      note: 'Monthly rent payment',
    })

    expect(p.categoryId).toBe(cat.id)
    expect(p.note).toBe('Monthly rent payment')
  })

  it('create sets timestamps and sortOrder', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const before = Date.now()
    const p1 = await caller.pots.create({ name: 'Pot A', ownerId: joint.id })
    const p2 = await caller.pots.create({ name: 'Pot B', ownerId: joint.id })
    const after = Date.now()

    expect(p1.createdAt).toBeGreaterThanOrEqual(before)
    expect(p1.createdAt).toBeLessThanOrEqual(after)
    expect(p1.sortOrder).toBe(1)
    expect(p2.sortOrder).toBe(2)
  })

  it('list is ordered by sortOrder asc then name asc', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const z = await caller.pots.create({ name: 'Zebra', ownerId: joint.id })
    const a = await caller.pots.create({ name: 'Alpha', ownerId: joint.id })

    // sortOrder: Zebra=1, Alpha=2
    const list = await caller.pots.list()
    expect(list[0]?.id).toBe(z.id)
    expect(list[1]?.id).toBe(a.id)
  })

  it('update renames a pot', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Old', ownerId: joint.id })
    const updated = await caller.pots.update({ id: p.id, name: 'New' })

    expect(updated.name).toBe('New')
    expect(updated.id).toBe(p.id)
  })

  it('update sets updatedAt', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'X', ownerId: joint.id })
    const before = Date.now()
    const updated = await caller.pots.update({ id: p.id, name: 'X2' })
    const after = Date.now()

    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
    expect(updated.updatedAt).toBeLessThanOrEqual(after)
  })

  it('update with bogus ownerId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Y', ownerId: joint.id })
    await expect(caller.pots.update({ id: p.id, ownerId: 'bad-id' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('update can flip isDrawdown', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Flip', ownerId: joint.id, isDrawdown: false })
    expect(p.isDrawdown).toBe(0)

    const updated = await caller.pots.update({ id: p.id, isDrawdown: true })
    expect(updated.isDrawdown).toBe(1)
  })

  it('archive removes from list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'ToArchive', ownerId: joint.id })
    await caller.pots.archive({ id: p.id })

    const list = await caller.pots.list()
    expect(list.find((x) => x.id === p.id)).toBeUndefined()
  })

  it('archive throws NOT_FOUND for unknown id', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    await expect(caller.pots.archive({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('usedIds omits pots with no references, includes pots used by a spend', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const used = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })
    const unused = await caller.pots.create({ name: 'Never Used', ownerId: joint.id })

    // Nothing references either pot yet.
    expect(await caller.pots.usedIds()).toEqual([])

    await caller.spends.add({ description: 'Aldi', amount: 1200, ownerId: joint.id, potId: used.id })

    const ids = await caller.pots.usedIds()
    expect(ids).toContain(used.id)
    expect(ids).not.toContain(unused.id)
  })

  it('create with a person member as owner works', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const person = await caller.members.addPerson({ displayName: 'Alice' })
    const p = await caller.pots.create({ name: 'Alice Pot', ownerId: person.id })

    expect(p.ownerId).toBe(person.id)
  })
})
