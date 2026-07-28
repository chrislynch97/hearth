import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('pots router', () => {
  it('create with valid ownerId → list returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    await expect(
      caller.pots.create({ name: 'Bad Pot', ownerId: 'does-not-exist' }),
    ).rejects.toThrow(TRPCError)
    await expect(
      caller.pots.create({ name: 'Bad Pot', ownerId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('create sets categoryId and note', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const before = Date.now()
    const p1 = await caller.pots.create({ name: 'Pot A', ownerId: joint.id })
    const p2 = await caller.pots.create({ name: 'Pot B', ownerId: joint.id })
    const after = Date.now()

    expect(p1.createdAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(p1.createdAt.getTime()).toBeLessThanOrEqual(after)
    expect(p1.sortOrder).toBe(1)
    expect(p2.sortOrder).toBe(2)
  })

  it('list is ordered by sortOrder asc then name asc', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'X', ownerId: joint.id })
    const before = Date.now()
    const updated = await caller.pots.update({ id: p.id, name: 'X2' })
    const after = Date.now()

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('update with a matching expectedUpdatedAt succeeds', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Old', ownerId: joint.id })
    const updated = await caller.pots.update({ id: p.id, expectedUpdatedAt: p.updatedAt, name: 'New' })

    expect(updated.name).toBe('New')
  })

  it('update with a stale expectedUpdatedAt throws CONFLICT (optimistic lock, issue #23)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Shared', ownerId: joint.id })

    // Model two members editing at once: the row's updatedAt has already moved on
    // from what this caller last read (here, one tick earlier). The guarded write
    // must refuse rather than silently clobber the other edit.
    await expect(
      caller.pots.update({ id: p.id, expectedUpdatedAt: new Date(p.updatedAt.getTime() - 1), name: 'Clobber' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    // The pot is untouched.
    const [current] = await caller.pots.list()
    expect(current?.name).toBe('Shared')
  })

  it('second concurrent save is rejected once the first has landed', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })
    const loadedUpdatedAt = p.updatedAt // both members loaded this version

    // First member saves against the version they loaded → wins.
    const won = await caller.pots.update({ id: p.id, expectedUpdatedAt: loadedUpdatedAt, name: 'Food' })
    expect(won.name).toBe('Food')

    // Second member still holds the original version. Their save must conflict
    // unless the winning write happened to land in the same millisecond.
    if (won.updatedAt !== loadedUpdatedAt) {
      await expect(
        caller.pots.update({ id: p.id, expectedUpdatedAt: loadedUpdatedAt, name: 'Snacks' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    }
  })

  it('update on an unknown id still throws NOT_FOUND', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    await expect(
      caller.pots.update({ id: 'nonexistent', expectedUpdatedAt: new Date(123), name: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('update without expectedUpdatedAt keeps last-write-wins', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Unguarded', ownerId: joint.id })
    const updated = await caller.pots.update({ id: p.id, name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
  })

  it('update with bogus ownerId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const p = await caller.pots.create({ name: 'Y', ownerId: joint.id })
    await expect(caller.pots.update({ id: p.id, ownerId: 'bad-id' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('archive removes from list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    await expect(caller.pots.archive({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('usedIds omits pots with no references, includes pots used by a spend', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

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

  it('usedIds includes a pot funded by a current bill', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const funded = await caller.pots.create({ name: 'Rent', ownerId: joint.id })
    const unused = await caller.pots.create({ name: 'Never Used', ownerId: joint.id })

    await caller.expenses.create({
      name: 'Rent',
      recurrence: 'monthly',
      amount: 90000,
      funding: 'pot_manual',
      potId: funded.id,
    })

    const ids = await caller.pots.usedIds()
    expect(ids).toContain(funded.id)
    expect(ids).not.toContain(unused.id)
  })

  it('usedIds includes a pot filled by a set-aside', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const filled = await caller.pots.create({ name: 'Holiday', ownerId: joint.id })
    const unused = await caller.pots.create({ name: 'Never Used', ownerId: joint.id })

    await caller.setAside.create({
      name: 'Holiday Fund',
      ownerId: joint.id,
      potId: filled.id,
      amount: 5000,
      recurrence: 'monthly',
    })

    const ids = await caller.pots.usedIds()
    expect(ids).toContain(filled.id)
    expect(ids).not.toContain(unused.id)
  })

  it('create with a person member as owner works', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({ displayName: 'Alice' })
    const p = await caller.pots.create({ name: 'Alice Pot', ownerId: person.id })

    expect(p.ownerId).toBe(person.id)
  })
})
