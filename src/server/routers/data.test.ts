import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('data router', () => {
  it('export → import round-trips the whole database', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 4200, ownerId: alice.id, potId: pot.id })

    const snapshot = await caller.data.export()
    expect(snapshot.tables['pot']).toHaveLength(1)

    // Mutate away from the snapshot, then restore it.
    await caller.pots.create({ name: 'Extra Pot', ownerId: alice.id })
    expect(await caller.pots.list()).toHaveLength(2)

    const result = await caller.data.import(snapshot)
    expect(result['pot']).toBe(1)

    const potsAfter = await caller.pots.list()
    expect(potsAfter).toHaveLength(1)
    expect(potsAfter[0]?.name).toBe('Rent')
    const spends = await caller.spends.list()
    expect(spends).toHaveLength(1)
    expect(spends[0]?.description).toBe('Tesco')
  })

  it('import rejects a snapshot with no household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    await expect(caller.data.import({ version: 1, tables: { household: [] } })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('reset wipes data and returns to a fresh, setup-incomplete household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    await caller.members.addPerson({ displayName: 'Alice' })
    await caller.household.completeSetup()
    await caller.categories.create({ name: 'Bills' })

    await caller.data.reset()

    expect(await caller.categories.list()).toEqual([])
    const ctx = await caller.bootstrap.context()
    expect(ctx.needsSetup).toBe(true)
    // Only the seeded joint member remains.
    expect(ctx.members.filter((m) => m.kind === 'person')).toEqual([])
    expect(ctx.members.some((m) => m.kind === 'joint')).toBe(true)
  })

  it('rescaleCurrency scales every money column and updates the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 1250, ownerId: alice.id, potId: pot.id })

    await caller.data.rescaleCurrency({ decimalPlaces: 3 }) // 2dp → 3dp, ×10

    const spends = await caller.spends.list()
    expect(spends[0]?.amount).toBe(12500)
    const ctx = await caller.bootstrap.context()
    expect(ctx.household?.currencyDecimalPlaces).toBe(3)
  })

  it('stats reports per-table counts', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    await caller.members.addPerson({ displayName: 'Alice' })

    const stats = await caller.data.stats()
    expect(stats.counts['household']).toBe(1)
    expect(stats.counts['member']).toBe(2) // joint + Alice
  })
})
