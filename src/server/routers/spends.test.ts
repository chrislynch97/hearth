import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('spends router', () => {
  it('add with a pot → list returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

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
    const caller = appRouter.createCaller({ db })

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
    const caller = appRouter.createCaller({ db })

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('add with a bogus potId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: joint.id, potId: 'bad-pot' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('suggestPot returns a previously-used pot for a repeated description', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

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
    const caller = appRouter.createCaller({ db })

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
