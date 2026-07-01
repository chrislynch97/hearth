import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('expenses router', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent Pot', ownerId: joint.id })
    return { db, caller, joint, alice, pot }
  }

  it('create with shares → list returns it with shares', async () => {
    const { caller, joint, alice, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'Rent',
      recurrence: 'monthly',
      shares: [
        { ownerId: joint.id, amount: 80000, potId: pot.id },
        { ownerId: alice.id, amount: 2000, potId: null },
      ],
    })

    expect(created.id).toBeTruthy()
    expect(created.name).toBe('Rent')
    expect(created.recurrence).toBe('monthly')
    expect(created.shares).toHaveLength(2)

    const list = await caller.expenses.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(created.id)
    expect(list[0]?.shares).toHaveLength(2)
    const share1 = list[0]?.shares.find((s) => s.ownerId === joint.id)
    expect(share1?.amount).toBe(80000)
    expect(share1?.potId).toBe(pot.id)
    const share2 = list[0]?.shares.find((s) => s.ownerId === alice.id)
    expect(share2?.potId).toBeNull()
  })

  it('create requires at least one share with amount > 0', async () => {
    const { caller, joint } = await setup()

    await expect(
      caller.expenses.create({
        name: 'Zero Expense',
        recurrence: 'monthly',
        shares: [{ ownerId: joint.id, amount: 0, potId: null }],
      }),
    ).rejects.toThrow(TRPCError)

    await expect(
      caller.expenses.create({
        name: 'No Shares',
        recurrence: 'monthly',
        shares: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('create with bogus ownerId throws BAD_REQUEST', async () => {
    const { caller, pot } = await setup()

    await expect(
      caller.expenses.create({
        name: 'Bad Owner',
        recurrence: 'monthly',
        shares: [{ ownerId: 'does-not-exist', amount: 1000, potId: pot.id }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('create with bogus potId throws BAD_REQUEST', async () => {
    const { caller, joint } = await setup()

    await expect(
      caller.expenses.create({
        name: 'Bad Pot',
        recurrence: 'monthly',
        shares: [{ ownerId: joint.id, amount: 1000, potId: 'does-not-exist' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('update replaces shares', async () => {
    const { caller, joint, alice, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'Insurance',
      recurrence: 'yearly',
      shares: [{ ownerId: joint.id, amount: 12000, potId: pot.id }],
    })

    const updated = await caller.expenses.update({
      id: created.id,
      shares: [
        { ownerId: alice.id, amount: 5000, potId: null },
      ],
    })

    expect(updated.shares).toHaveLength(1)
    expect(updated.shares[0]?.ownerId).toBe(alice.id)
    expect(updated.shares[0]?.amount).toBe(5000)

    const list = await caller.expenses.list()
    expect(list[0]?.shares).toHaveLength(1)
  })

  it('update can change name, recurrence, active', async () => {
    const { caller, joint, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'Old Name',
      recurrence: 'monthly',
      shares: [{ ownerId: joint.id, amount: 1000, potId: pot.id }],
    })

    const updated = await caller.expenses.update({
      id: created.id,
      name: 'New Name',
      recurrence: 'quarterly',
      active: false,
    })

    expect(updated.name).toBe('New Name')
    expect(updated.recurrence).toBe('quarterly')
    expect(updated.active).toBe(0)
    // shares unchanged since not provided
    expect(updated.shares).toHaveLength(1)
  })

  it('update with bogus ownerId in replacement shares throws BAD_REQUEST', async () => {
    const { caller, joint, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'Test',
      recurrence: 'monthly',
      shares: [{ ownerId: joint.id, amount: 1000, potId: pot.id }],
    })

    await expect(
      caller.expenses.update({
        id: created.id,
        shares: [{ ownerId: 'bad-id', amount: 1000, potId: null }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('archive removes from list', async () => {
    const { caller, joint, pot } = await setup()

    const created = await caller.expenses.create({
      name: 'ToArchive',
      recurrence: 'monthly',
      shares: [{ ownerId: joint.id, amount: 1000, potId: pot.id }],
    })

    await caller.expenses.archive({ id: created.id })

    const list = await caller.expenses.list()
    expect(list.find((e) => e.id === created.id)).toBeUndefined()
  })

  it('list is ordered by name', async () => {
    const { caller, joint, pot } = await setup()

    await caller.expenses.create({
      name: 'Zebra',
      recurrence: 'monthly',
      shares: [{ ownerId: joint.id, amount: 1000, potId: pot.id }],
    })
    await caller.expenses.create({
      name: 'Alpha',
      recurrence: 'monthly',
      shares: [{ ownerId: joint.id, amount: 1000, potId: pot.id }],
    })

    const list = await caller.expenses.list()
    expect(list[0]?.name).toBe('Alpha')
    expect(list[1]?.name).toBe('Zebra')
  })
})
