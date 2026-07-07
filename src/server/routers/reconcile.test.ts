import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('reconcile router', () => {
  it('backlog shows the per-pot total for unreconciled spends', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })
    await caller.spends.add({ description: 'Sainsburys', amount: 1500, ownerId: joint.id, potId: pot.id })

    const backlog = await caller.reconcile.backlog()
    const potGroup = backlog.perPot.find((p) => p.potId === pot.id)
    expect(potGroup).toBeDefined()
    expect(potGroup?.total).toBe(4000)
    expect(potGroup?.count).toBe(2)
  })

  it('markPotMoved creates a batch and reconciles the rows; backlog drops; undoBatch reverses it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })
    await caller.spends.add({ description: 'Sainsburys', amount: 1500, ownerId: joint.id, potId: pot.id })

    const batch = await caller.reconcile.markPotMoved({ potId: pot.id })
    expect(batch.totalAmount).toBe(4000)
    expect(batch.transactionCount).toBe(2)
    expect(batch.potId).toBe(pot.id)

    const backlogAfter = await caller.reconcile.backlog()
    expect(backlogAfter.perPot.find((p) => p.potId === pot.id)).toBeUndefined()

    const spends = await caller.spends.list({ potId: pot.id })
    expect(spends.every((s) => s.reconciled === 1)).toBe(true)
    expect(spends.every((s) => s.reconciliationBatchId === batch.id)).toBe(true)

    const undone = await caller.reconcile.undoBatch({ batchId: batch.id })
    expect(undone).toEqual({ batchId: batch.id })

    const backlogRestored = await caller.reconcile.backlog()
    const potGroup = backlogRestored.perPot.find((p) => p.potId === pot.id)
    expect(potGroup?.total).toBe(4000)

    const spendsAfterUndo = await caller.spends.list({ potId: pot.id })
    expect(spendsAfterUndo.every((s) => s.reconciled === 0)).toBe(true)
    expect(spendsAfterUndo.every((s) => s.reconciliationBatchId === null)).toBe(true)
  })

  it('deleting the last spend of a batch removes the batch; deleting one of several keeps it with recomputed totals', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    const tesco = await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })
    const sains = await caller.spends.add({ description: 'Sainsburys', amount: 1500, ownerId: joint.id, potId: pot.id })

    const batch = await caller.reconcile.markPotMoved({ potId: pot.id })
    expect(batch.transactionCount).toBe(2)

    // Delete one of two — batch survives with updated totals.
    await caller.spends.remove({ id: tesco.id })
    const afterOne = await caller.reconcile.batches()
    const stillThere = afterOne.find((b) => b.id === batch.id)
    expect(stillThere?.transactionCount).toBe(1)
    expect(stillThere?.totalAmount).toBe(1500)

    // Delete the last one — batch is gone entirely.
    await caller.spends.remove({ id: sains.id })
    const afterAll = await caller.reconcile.batches()
    expect(afterAll.find((b) => b.id === batch.id)).toBeUndefined()
  })

  it('markPotMoved on a pot with nothing unreconciled throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Empty Pot', ownerId: joint.id })

    await expect(caller.reconcile.markPotMoved({ potId: pot.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('settled-at-source spends never appear on the backlog', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Cloud', ownerId: joint.id })

    await caller.spends.add({ description: 'Auto sub', amount: 800, ownerId: joint.id, potId: pot.id, settledAtSource: true })

    const backlog = await caller.reconcile.backlog()
    expect(backlog.perPot.find((p) => p.potId === pot.id)).toBeUndefined()
  })

  it('backlog breaks a pot down by payer, and markPotMoved settles just one payer', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bob = await caller.members.addPerson({ displayName: 'Bob' })
    const pot = await caller.pots.create({ name: 'Eating Out', ownerId: joint.id })

    // Two payers spending from the same joint pot.
    await caller.spends.add({ description: 'Dinner', amount: 2000, ownerId: alice.id, potId: pot.id })
    await caller.spends.add({ description: 'Lunch', amount: 1400, ownerId: bob.id, potId: pot.id })

    const backlog = await caller.reconcile.backlog()
    const group = backlog.perPot.find((p) => p.potId === pot.id)!
    expect(group.total).toBe(3400)
    expect(group.payers).toHaveLength(2)

    // Settle only Alice's slice.
    const batch = await caller.reconcile.markPotMoved({ potId: pot.id, ownerId: alice.id })
    expect(batch.totalAmount).toBe(2000)
    expect(batch.ownerId).toBe(alice.id)

    // Bob's slice remains on the backlog.
    const after = await caller.reconcile.backlog()
    const groupAfter = after.perPot.find((p) => p.potId === pot.id)!
    expect(groupAfter.total).toBe(1400)
    expect(groupAfter.payers).toHaveLength(1)
    expect(groupAfter.payers[0]!.ownerId).toBe(bob.id)
  })

  it('batches lists reconciliation batches ordered by createdAt desc', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const potA = await caller.pots.create({ name: 'Pot A', ownerId: joint.id })
    const potB = await caller.pots.create({ name: 'Pot B', ownerId: joint.id })

    await caller.spends.add({ description: 'X', amount: 100, ownerId: joint.id, potId: potA.id })
    const batch1 = await caller.reconcile.markPotMoved({ potId: potA.id })

    await caller.spends.add({ description: 'Y', amount: 200, ownerId: joint.id, potId: potB.id })
    const batch2 = await caller.reconcile.markPotMoved({ potId: potB.id })

    const batches = await caller.reconcile.batches()
    expect(batches[0]?.id).toBe(batch2.id)
    expect(batches[1]?.id).toBe(batch1.id)
  })
})
