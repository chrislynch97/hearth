import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('dashboard.summary', () => {
  it('composes period, funding, backlog, allocation, trend, recent activity and upcoming', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const cat = await caller.categories.create({ name: 'Bills' })
    const pot = await caller.pots.create({ name: 'Rent Pot', ownerId: alice.id, categoryId: cat.id })

    await caller.expenses.create({
      name: 'Rent', recurrence: 'monthly', dueAnchor: '2026-01-15', amount: 100000, funding: 'pot_manual', potId: pot.id,
    })

    // A spend that lands in the backlog + recent activity.
    await caller.spends.add({ description: 'Tesco', amount: 4200, ownerId: alice.id, potId: pot.id })

    const summary = await caller.dashboard.summary()

    // Period is a well-formed range.
    expect(summary.period.start <= summary.period.end).toBe(true)

    // Funding: Alice's Rent pot funded at 100000/mo.
    expect(summary.funding.pots.find((p) => p.potId === pot.id)?.fundingPerPeriod).toBe(100000)

    // Backlog picks up the un-reconciled spend.
    expect(summary.backlog.grandTotal).toBe(4200)
    expect(summary.backlog.perPot.find((g) => g.potId === pot.id)?.total).toBe(4200)

    // Allocation groups the pot's funding under its category.
    expect(summary.allocation.perCategory.find((c) => c.categoryId === cat.id)?.funding).toBe(100000)
    expect(summary.allocation.total).toBe(100000)

    // Trend is always 12 months.
    expect(summary.incomeTrend).toHaveLength(12)

    // Recent activity surfaces the spend with resolved names.
    expect(summary.recentActivity[0]).toMatchObject({ description: 'Tesco', ownerName: 'Alice', potName: 'Rent Pot' })

    // Upcoming projects the monthly rent — a 30-day window always contains one occurrence.
    expect(summary.upcoming).toHaveLength(1)
    expect(summary.upcoming[0]?.amount).toBe(100000)
  })

  it('is calm and empty on a fresh household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const summary = await caller.dashboard.summary()
    expect(summary.backlog.grandTotal).toBe(0)
    expect(summary.funding.perPerson).toEqual([])
    expect(summary.allocation.perCategory).toEqual([])
    expect(summary.upcoming).toEqual([])
    expect(summary.recentActivity).toEqual([])
    expect(summary.householdPeriodIncome).toBe(0)
  })
})
