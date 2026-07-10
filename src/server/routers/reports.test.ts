import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { todayIso } from '../../shared/dates'
import { periodForDate } from '../../shared/period'

describe('reports.overview', () => {
  it('reports spend vs allocation, category breakdown and fairness', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bills = await caller.categories.create({ name: 'Bills' })
    const pot = await caller.pots.create({ name: 'Rent Pot', ownerId: alice.id, categoryId: bills.id })

    // Plan £100/mo of Bills funding.
    await caller.expenses.create({
      name: 'Rent', recurrence: 'monthly', amount: 10000, funding: 'pot_manual', potId: pot.id,
    })

    // Spend £60 against it, dated inside the current period.
    const period = periodForDate(todayIso(), 1)
    await caller.spends.add({ date: period.start, description: 'Rent part', amount: 6000, ownerId: alice.id, potId: pot.id })

    const report = await caller.reports.overview()

    const billsRow = report.spendVsAllocation.find((r) => r.categoryId === bills.id)!
    expect(billsRow).toMatchObject({ planned: 10000, actual: 6000, diff: 4000 })

    expect(report.categoryBreakdown.total).toBe(6000)
    expect(report.categoryBreakdown.rows[0]).toMatchObject({ categoryId: bills.id, spent: 6000 })

    expect(report.perMemberVsJoint.find((r) => r.ownerId === alice.id)?.monthlyCost).toBe(10000)

    expect(report.monthOverMonth.months.length).toBe(6)
  })

  it('counts main-account bills in the planned allocation (#9)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const utilities = await caller.categories.create({ name: 'Utilities' })

    // A £150/mo bill paid straight from the main account (no pot).
    await caller.expenses.create({
      name: 'Electricity', recurrence: 'monthly', amount: 15000, funding: 'main', categoryId: utilities.id,
    })

    // £150 actually spent in that category this period.
    const period = periodForDate(todayIso(), 1)
    await caller.spends.add({
      date: period.start, description: 'Electric bill', amount: 15000, ownerId: alice.id, categoryId: utilities.id,
    })

    const report = await caller.reports.overview()

    // Before the fix this read planned £0 / actual £150 → permanently overspent.
    const row = report.spendVsAllocation.find((r) => r.categoryId === utilities.id)!
    expect(row).toMatchObject({ planned: 15000, actual: 15000, diff: 0 })
  })

  it('owner filter scopes spend-based reports', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bob = await caller.members.addPerson({ displayName: 'Bob' })
    const period = periodForDate(todayIso(), 1)
    await caller.spends.add({ date: period.start, description: 'A', amount: 5000, ownerId: alice.id })
    await caller.spends.add({ date: period.start, description: 'B', amount: 3000, ownerId: bob.id })

    const all = await caller.reports.overview()
    expect(all.categoryBreakdown.total).toBe(8000)

    const aliceOnly = await caller.reports.overview({ ownerId: alice.id })
    expect(aliceOnly.categoryBreakdown.total).toBe(5000)
  })
})
