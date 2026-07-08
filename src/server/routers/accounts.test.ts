import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('accounts router', () => {
  it('creates accounts and reports the latest balance as current value', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    const house = await caller.accounts.create({ name: 'House', kind: 'asset', ownerId: joint.id })
    await caller.accounts.addBalance({ accountId: house.id, asOfDate: '2024-01-01', value: 30000000 })
    await caller.accounts.addBalance({ accountId: house.id, asOfDate: '2025-01-01', value: 32000000 })

    const list = await caller.accounts.list()
    const row = list.find((a) => a.id === house.id)!
    expect(row.currentValue).toBe(32000000)
    expect(row.asOfDate).toBe('2025-01-01')
  })

  it('overwrites the snapshot when the same date is added twice', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    const pot = await caller.accounts.create({ name: 'Savings', kind: 'asset', ownerId: joint.id })
    await caller.accounts.addBalance({ accountId: pot.id, asOfDate: '2025-03-01', value: 100000 })
    await caller.accounts.addBalance({ accountId: pot.id, asOfDate: '2025-03-01', value: 150000 })

    const balances = await caller.accounts.balances({ accountId: pot.id })
    expect(balances).toHaveLength(1)
    expect(balances[0]?.value).toBe(150000)
  })

  it('computes net worth as assets minus liabilities', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    const house = await caller.accounts.create({ name: 'House', kind: 'asset', ownerId: joint.id })
    const mortgage = await caller.accounts.create({ name: 'Mortgage', kind: 'liability', ownerId: joint.id })
    await caller.accounts.addBalance({ accountId: house.id, asOfDate: '2025-01-01', value: 32000000 })
    await caller.accounts.addBalance({ accountId: mortgage.id, asOfDate: '2025-01-01', value: 18000000 })

    const summary = await caller.accounts.summary()
    expect(summary.assets).toBe(32000000)
    expect(summary.liabilities).toBe(18000000)
    expect(summary.netWorth).toBe(14000000)
    expect(summary.timeline.at(-1)?.netWorth).toBe(14000000)
  })

  it('rejects an unknown owner and hides archived accounts', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    await expect(
      caller.accounts.create({ name: 'X', kind: 'asset', ownerId: 'nope' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const acc = await caller.accounts.create({ name: 'Old ISA', kind: 'asset', ownerId: joint.id })
    await caller.accounts.archive({ id: acc.id })
    expect((await caller.accounts.list()).some((a) => a.id === acc.id)).toBe(false)
  })
})
