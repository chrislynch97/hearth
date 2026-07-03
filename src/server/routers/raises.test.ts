import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('raises router', () => {
  it('lists a person\'s raises oldest-first with computed percentIncrease', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    await caller.raises.create({ ownerId: alice.id, effectiveDate: '2024-06-01', newSalary: 4400000 })
    await caller.raises.create({ ownerId: alice.id, effectiveDate: '2022-01-01', newSalary: 4000000 })

    const list = await caller.raises.list({ ownerId: alice.id })
    expect(list.map((r) => r.effectiveDate)).toEqual(['2022-01-01', '2024-06-01'])
    expect(list[0]?.percentIncrease).toBeNull() // baseline
    expect(list[1]?.percentIncrease).toBeCloseTo(10, 5) // 40k → 44k
  })

  it('scopes percentIncrease to the same owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bob = await caller.members.addPerson({ displayName: 'Bob' })

    await caller.raises.create({ ownerId: alice.id, effectiveDate: '2023-01-01', newSalary: 5000000 })
    const bobRaise = await caller.raises.create({ ownerId: bob.id, effectiveDate: '2023-06-01', newSalary: 3000000 })

    const bobList = await caller.raises.list({ ownerId: bob.id })
    // Bob has only one raise → baseline, regardless of Alice's earlier higher salary.
    expect(bobList.find((r) => r.id === bobRaise.id)?.percentIncrease).toBeNull()
  })

  it('rejects the joint member and edits/removes raises', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    await expect(
      caller.raises.create({ ownerId: joint.id, effectiveDate: '2024-01-01', newSalary: 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const r = await caller.raises.create({ ownerId: alice.id, effectiveDate: '2024-01-01', newSalary: 4000000 })
    const updated = await caller.raises.update({ id: r.id, newSalary: 4200000 })
    expect(updated.newSalary).toBe(4200000)
    await caller.raises.remove({ id: r.id })
    expect(await caller.raises.list({ ownerId: alice.id })).toEqual([])
  })
})
