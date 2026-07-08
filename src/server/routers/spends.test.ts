import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('spends router — needsPot filter', () => {
  it('excludes main-account (settled, pot-less) spends from "needs a pot"', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const cat = await caller.categories.create({ name: 'Subscriptions' })

    // Genuinely unassigned — should be flagged.
    await caller.spends.add({ description: 'Cash', amount: 4000, ownerId: joint.id, potId: null })
    // Main account — pot-less but settled at source; must NOT be flagged.
    await caller.spends.add({
      description: 'Spotify',
      amount: 1200,
      ownerId: joint.id,
      potId: null,
      categoryId: cat.id,
      settledAtSource: true,
    })

    const needsPot = await caller.spends.list({ needsPot: true })
    expect(needsPot.map((s) => s.description)).toEqual(['Cash'])
  })
})

describe('spends router — split', () => {
  it('splits a spend into rows that sum to the original, sharing a group id', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const groceries = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })
    const treats = await caller.pots.create({ name: 'Treats', ownerId: alice.id })

    const s = await caller.spends.add({ description: 'Big shop', amount: 5000, ownerId: joint.id, potId: groceries.id })
    const group = await caller.spends.split({
      id: s.id,
      parts: [
        { amount: 3000, ownerId: joint.id, potId: groceries.id },
        { amount: 2000, ownerId: alice.id, potId: treats.id },
      ],
    })

    expect(group).toHaveLength(2)
    expect(group.reduce((a, r) => a + r.amount, 0)).toBe(5000)
    expect(new Set(group.map((r) => r.splitGroupId)).size).toBe(1)
    expect(group.every((r) => r.description === 'Big shop' && r.date === s.date)).toBe(true)
    // The original row is reused as one of the parts.
    expect(group.some((r) => r.id === s.id)).toBe(true)
  })

  it('rejects a split that does not sum to the original', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const s = await caller.spends.add({ description: 'X', amount: 5000, ownerId: joint.id })
    await expect(
      caller.spends.split({
        id: s.id,
        parts: [
          { amount: 3000, ownerId: joint.id },
          { amount: 1000, ownerId: joint.id },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('refuses to split a reconciled spend', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'P', ownerId: joint.id })
    const s = await caller.spends.add({ description: 'X', amount: 4000, ownerId: joint.id, potId: pot.id })
    await caller.reconcile.markPotMoved({ potId: pot.id })
    await expect(
      caller.spends.split({
        id: s.id,
        parts: [
          { amount: 2000, ownerId: joint.id, potId: pot.id },
          { amount: 2000, ownerId: joint.id, potId: pot.id },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('spends router', () => {
  it('add with a pot → list returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    const s = await caller.spends.add({
      description: 'Tesco',
      amount: 2500,
      ownerId: joint.id,
      potId: pot.id,
    })

    expect(s.id).toBeTruthy()
    expect(s.description).toBe('Tesco')
    expect(s.amount).toBe(2500)
    expect(s.potId).toBe(pot.id)
    expect(s.reconciled).toBe(0)
    expect(s.source).toBe('manual')

    const list = await caller.spends.list({})
    expect(list.length).toBe(1)
    expect(list[0]?.id).toBe(s.id)
  })

  it('add without a pot → list({needsPot:true}) returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const s = await caller.spends.add({
      description: 'Unknown shop',
      amount: 1000,
      ownerId: joint.id,
    })

    expect(s.potId).toBeNull()

    const needsPot = await caller.spends.list({ needsPot: true })
    expect(needsPot.map((t) => t.id)).toContain(s.id)
  })

  it('add with a bogus ownerId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('add with a bogus potId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: joint.id, potId: 'bad-pot' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('suggestPot returns a previously-used pot for a repeated description', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })

    const suggestion = await caller.spends.suggestPot({ description: 'tesco', ownerId: joint.id })
    expect(suggestion).toEqual({ potId: pot.id })
  })

  it('update changes fields and remove deletes the row', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    const s = await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })

    const updated = await caller.spends.update({ id: s.id, description: 'Tesco Express', amount: 3000 })
    expect(updated.description).toBe('Tesco Express')
    expect(updated.amount).toBe(3000)

    const removed = await caller.spends.remove({ id: s.id })
    expect(removed).toEqual({ id: s.id })

    const list = await caller.spends.list({})
    expect(list.find((t) => t.id === s.id)).toBeUndefined()
  })
})
