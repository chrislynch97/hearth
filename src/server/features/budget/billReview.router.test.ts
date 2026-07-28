import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { spendTransaction } from '../../db/schema'
import { newId } from '../../../shared/ids'

describe('bill review (issue #70)', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Bills Pot', ownerId: joint.id })
    return { db, caller, pot, joint }
  }

  it('ranks bills by 12-month change, unchanged sorting to the bottom', async () => {
    const { caller, pot } = await setup()
    const broadband = await caller.expenses.create({ name: 'Broadband', recurrence: 'monthly', amount: 3000, funding: 'pot_manual', potId: pot.id })
    const phone = await caller.expenses.create({ name: 'Phone', recurrence: 'monthly', amount: 2200, funding: 'pot_manual', potId: pot.id })

    // Broadband climbs; phone stays put.
    await caller.expenses.update({ id: broadband.id, amount: 3600, priceEffectiveDate: '2026-05-01' })

    const review = await caller.billReview.review()
    const byId = new Map(review.map((r) => [r.id, r]))
    expect(byId.get(broadband.id)?.changeAnnual).toBe(7200) // (3600 − 3000) × 12
    expect(byId.get(broadband.id)?.riseCount).toBe(1)
    expect(byId.get(phone.id)?.hasHistory).toBe(false)
    expect(byId.get(phone.id)?.changeAnnual).toBe(0)
  })

  it('prefers actual payments over stated history', async () => {
    const { db, caller, pot, joint } = await setup()
    const broadband = await caller.expenses.create({ name: 'Broadband', recurrence: 'monthly', amount: 3000, funding: 'pot_manual', potId: pot.id })

    // Two logged payments at a higher price than the bill records.
    const now = new Date()
    for (const [date, amount] of [
      ['2025-08-20', 3000],
      ['2026-07-20', 3400],
    ] as const) {
      await db.insert(spendTransaction).values({
        id: newId(), householdId: 'household', date, description: 'Broadband', amount,
        ownerId: joint.id, potId: pot.id, expenseId: broadband.id, reconciled: 1, reconciledAt: now,
        source: 'manual', createdAt: now, updatedAt: now,
      })
    }

    const review = await caller.billReview.review()
    const row = review.find((r) => r.id === broadband.id)!
    expect(row.source).toBe('actual')
    expect(row.currentAmount).toBe(3400) // from the payment, not the bill's 3000
  })

  it('excludes archived and inactive bills', async () => {
    const { caller, pot } = await setup()
    const live = await caller.expenses.create({ name: 'Live', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id })
    const gone = await caller.expenses.create({ name: 'Gone', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id })
    await caller.expenses.archive({ id: gone.id })

    const review = await caller.billReview.review()
    expect(review.map((r) => r.id)).toEqual([live.id])
  })

  it('scopes to the caller household', async () => {
    const { db, caller: owner, pot } = await setup()
    await owner.expenses.create({ name: 'Mine', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id })

    const other = appRouter.createCaller({ db, householdId: 'other', role: 'owner' })
    expect(await other.billReview.review()).toEqual([])
  })
})
