import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('incomeSources router', () => {
  it('creates, lists, filters by owner, and defaults basis to net', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bob = await caller.members.addPerson({ displayName: 'Bob' })

    const rent = await caller.incomeSources.create({
      ownerId: alice.id,
      name: 'Rental income',
      amount: 50000,
      recurrence: 'monthly',
    })
    expect(rent.basis).toBe('net')
    expect(rent.active).toBe(1)

    await caller.incomeSources.create({ ownerId: bob.id, name: 'Side gig', amount: 10000, recurrence: 'monthly' })

    const all = await caller.incomeSources.list()
    expect(all.length).toBe(2)

    const aliceOnly = await caller.incomeSources.list({ ownerId: alice.id })
    expect(aliceOnly.map((r) => r.name)).toEqual(['Rental income'])
  })

  it('rejects a bogus ownerId', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    await expect(
      caller.incomeSources.create({ ownerId: 'nope', name: 'X', amount: 1, recurrence: 'monthly' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('update toggles active and archive hides from list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    const src = await caller.incomeSources.create({ ownerId: alice.id, name: 'X', amount: 100, recurrence: 'monthly' })
    const updated = await caller.incomeSources.update({ id: src.id, active: false, amount: 200 })
    expect(updated.active).toBe(0)
    expect(updated.amount).toBe(200)

    await caller.incomeSources.archive({ id: src.id })
    expect(await caller.incomeSources.list()).toEqual([])
  })
})
