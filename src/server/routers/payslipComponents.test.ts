import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('payslipComponents router', () => {
  it('creates components per person with incrementing sortOrder', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    const basic = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Basic Pay', kind: 'earning' })
    const bonus = await caller.payslipComponents.create({
      ownerId: alice.id,
      name: 'Bonus',
      kind: 'earning',
      isVariable: true,
    })
    expect(basic.sortOrder).toBe(1)
    expect(bonus.sortOrder).toBe(2)
    expect(bonus.isVariable).toBe(1)

    const list = await caller.payslipComponents.list({ ownerId: alice.id })
    expect(list.map((c) => c.name)).toEqual(['Basic Pay', 'Bonus'])
  })

  it('rejects the joint member as a component owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    await expect(
      caller.payslipComponents.create({ ownerId: joint.id, name: 'Basic', kind: 'earning' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('archive removes from list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const c = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Basic', kind: 'earning' })
    await caller.payslipComponents.archive({ id: c.id })
    expect(await caller.payslipComponents.list({ ownerId: alice.id })).toEqual([])
  })
})
