import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('expenses router (bills)', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent Pot', ownerId: joint.id })
    const category = await caller.categories.create({ name: 'Subscriptions' })
    return { db, caller, joint, alice, pot, category }
  }

  it('create a pot-funded bill → list returns it', async () => {
    const { caller, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'Rent',
      recurrence: 'monthly',
      amount: 80000,
      funding: 'pot_manual',
      potId: pot.id,
    })

    expect(created.id).toBeTruthy()
    expect(created.name).toBe('Rent')
    expect(created.amount).toBe(80000)
    expect(created.funding).toBe('pot_manual')
    expect(created.potId).toBe(pot.id)
    expect(created.categoryId).toBeNull()

    const list = await caller.expenses.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(created.id)
  })

  it('create an auto-pot bill keeps the pot but marks funding', async () => {
    const { caller, pot } = await setup()
    const created = await caller.expenses.create({
      name: 'Cloud', recurrence: 'monthly', amount: 800, funding: 'pot_auto', potId: pot.id,
    })
    expect(created.funding).toBe('pot_auto')
    expect(created.potId).toBe(pot.id)
  })

  it('create a main-account bill clears the pot and keeps the category', async () => {
    const { caller, category } = await setup()
    const created = await caller.expenses.create({
      name: 'Spotify', recurrence: 'monthly', amount: 1200, funding: 'main', categoryId: category.id,
    })
    expect(created.funding).toBe('main')
    expect(created.potId).toBeNull()
    expect(created.categoryId).toBe(category.id)
  })

  it('a pot-funded bill requires a pot', async () => {
    const { caller } = await setup()
    await expect(
      caller.expenses.create({ name: 'No Pot', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: null }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('a main-account bill requires a category', async () => {
    const { caller } = await setup()
    await expect(
      caller.expenses.create({ name: 'No Cat', recurrence: 'monthly', amount: 1000, funding: 'main' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('create with bogus potId throws BAD_REQUEST', async () => {
    const { caller } = await setup()
    await expect(
      caller.expenses.create({ name: 'Bad Pot', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: 'nope' }),
    ).rejects.toThrow(TRPCError)
  })

  it('update can switch funding from pot to main account', async () => {
    const { caller, pot, category } = await setup()
    const created = await caller.expenses.create({
      name: 'Sub', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id,
    })

    const updated = await caller.expenses.update({
      id: created.id,
      funding: 'main',
      categoryId: category.id,
    })

    expect(updated.funding).toBe('main')
    expect(updated.potId).toBeNull()
    expect(updated.categoryId).toBe(category.id)
  })

  it('update can change name, recurrence, active, amount', async () => {
    const { caller, pot } = await setup()
    const created = await caller.expenses.create({
      name: 'Old', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id,
    })

    const updated = await caller.expenses.update({
      id: created.id, name: 'New', recurrence: 'quarterly', active: false, amount: 2000,
    })

    expect(updated.name).toBe('New')
    expect(updated.recurrence).toBe('quarterly')
    expect(updated.active).toBe(0)
    expect(updated.amount).toBe(2000)
    // funding untouched
    expect(updated.potId).toBe(pot.id)
  })

  it('archive removes from list', async () => {
    const { caller, pot } = await setup()
    const created = await caller.expenses.create({
      name: 'ToArchive', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id,
    })
    await caller.expenses.archive({ id: created.id })
    const list = await caller.expenses.list()
    expect(list.find((e) => e.id === created.id)).toBeUndefined()
  })

  it('list is ordered by name', async () => {
    const { caller, pot } = await setup()
    await caller.expenses.create({ name: 'Zebra', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id })
    await caller.expenses.create({ name: 'Alpha', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id })
    const list = await caller.expenses.list()
    expect(list[0]?.name).toBe('Alpha')
    expect(list[1]?.name).toBe('Zebra')
  })
})
