import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('setAside router', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Alice · Spending', ownerId: alice.id })
    return { caller, alice, pot }
  }

  it('create → list returns it', async () => {
    const { caller, alice, pot } = await setup()
    const created = await caller.setAside.create({
      name: 'Treat Yo Self — Alice',
      groupLabel: 'Treat Yo Self',
      ownerId: alice.id,
      potId: pot.id,
      amount: 4000,
      recurrence: 'monthly',
    })
    expect(created.id).toBeTruthy()
    expect(created.groupLabel).toBe('Treat Yo Self')

    const list = await caller.setAside.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.amount).toBe(4000)
  })

  it('bogus owner / pot throws BAD_REQUEST', async () => {
    const { caller, alice, pot } = await setup()
    await expect(
      caller.setAside.create({ name: 'X', ownerId: 'nope', potId: pot.id, amount: 100, recurrence: 'monthly' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller.setAside.create({ name: 'X', ownerId: alice.id, potId: 'nope', amount: 100, recurrence: 'monthly' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('update and archive', async () => {
    const { caller, alice, pot } = await setup()
    const created = await caller.setAside.create({ name: 'ISA', ownerId: alice.id, potId: pot.id, amount: 10000, recurrence: 'monthly' })

    const updated = await caller.setAside.update({ id: created.id, amount: 12000 })
    expect(updated.amount).toBe(12000)

    await caller.setAside.archive({ id: created.id })
    const list = await caller.setAside.list()
    expect(list.find((s) => s.id === created.id)).toBeUndefined()
  })

  it('replaceForPot swaps a pot\'s contribution lines and derives owner from the pot', async () => {
    const { caller, alice, pot } = await setup()

    // Start with a single unnamed contribution.
    await caller.setAside.replaceForPot({ potId: pot.id, lines: [{ amount: 5000 }] })
    let list = await caller.setAside.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.ownerId).toBe(alice.id)
    expect(list[0]?.amount).toBe(5000)

    // Break it into two named parts — replaces the previous line entirely.
    await caller.setAside.replaceForPot({
      potId: pot.id,
      lines: [
        { label: 'Running', amount: 1000 },
        { label: 'Squash', amount: 500 },
      ],
    })
    list = await caller.setAside.list()
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.name).sort()).toEqual(['Running', 'Squash'])

    // Empty list clears the pot's contribution.
    await caller.setAside.replaceForPot({ potId: pot.id, lines: [] })
    expect(await caller.setAside.list()).toHaveLength(0)
  })

  it('feeds pot funding on the plan (money in)', async () => {
    const { caller, alice, pot } = await setup()
    await caller.setAside.create({ name: 'ISA', ownerId: alice.id, potId: pot.id, amount: 10000, recurrence: 'monthly' })

    const plan = await caller.plan.funding()
    const potFunding = plan.pots.find((p) => p.potId === pot.id)!
    expect(potFunding.fundingPerPeriod).toBe(10000)
    const person = plan.perPerson.find((p) => p.memberId === alice.id)!
    expect(person.personalPotFunding).toBe(10000)
  })
})
