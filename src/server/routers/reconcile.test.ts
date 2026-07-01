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
