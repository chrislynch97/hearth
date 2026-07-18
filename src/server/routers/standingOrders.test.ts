import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('standing-order staleness alerts (issue #69)', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Bills Pot', ownerId: joint.id })
    const bill = await caller.expenses.create({
      name: 'Broadband',
      recurrence: 'monthly',
      amount: 3000,
      funding: 'pot_manual',
      potId: pot.id,
    })
    return { db, caller, pot, bill }
  }

  it('has no alert before anything changes (no baseline to compare)', async () => {
    const { caller } = await setup()
    expect(await caller.standingOrders.alerts()).toEqual([])
  })

  it('a price change seeds a baseline and raises an attributed alert', async () => {
    const { caller, pot, bill } = await setup()

    await caller.expenses.update({ id: bill.id, amount: 3200 })

    const alerts = await caller.standingOrders.alerts()
    expect(alerts).toHaveLength(1)
    const alert = alerts[0]!
    expect(alert.potId).toBe(pot.id)
    expect(alert.potName).toBe('Bills Pot')
    expect(alert.wasMonthly).toBe(3000)
    expect(alert.nowMonthly).toBe(3200)
    expect(alert.deltaMonthly).toBe(200)
    expect(alert.contributors).toEqual([{ expenseId: bill.id, name: 'Broadband', deltaMonthly: 200 }])
  })

  it('acknowledging clears the alert until the next change', async () => {
    const { caller, pot, bill } = await setup()

    await caller.expenses.update({ id: bill.id, amount: 3200 })
    expect(await caller.standingOrders.alerts()).toHaveLength(1)

    await caller.standingOrders.acknowledge({ potId: pot.id })
    expect(await caller.standingOrders.alerts()).toEqual([])

    // A further change re-opens it, now measured from the acknowledged 3200.
    await caller.expenses.update({ id: bill.id, amount: 3300 })
    const alerts = await caller.standingOrders.alerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.wasMonthly).toBe(3200)
    expect(alerts[0]!.nowMonthly).toBe(3300)
    expect(alerts[0]!.contributors[0]!.deltaMonthly).toBe(100)
  })

  it('a change back to the acknowledged amount is not stale', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({ id: bill.id, amount: 3200 })
    await caller.expenses.update({ id: bill.id, amount: 3000 })

    expect(await caller.standingOrders.alerts()).toEqual([])
  })

  it('batches several bills in one pot into a single alert (one baseline)', async () => {
    const { caller, pot, bill } = await setup()
    const phone = await caller.expenses.create({
      name: 'Phone',
      recurrence: 'monthly',
      amount: 1000,
      funding: 'pot_manual',
      potId: pot.id,
    })

    // First change seeds the baseline at the pre-change pot total (3000 + 1000).
    await caller.expenses.update({ id: bill.id, amount: 3500 })
    await caller.expenses.update({ id: phone.id, amount: 1200 })

    const alerts = await caller.standingOrders.alerts()
    expect(alerts).toHaveLength(1)
    const alert = alerts[0]!
    expect(alert.potId).toBe(pot.id)
    expect(alert.wasMonthly).toBe(4000)
    expect(alert.nowMonthly).toBe(4700)
    expect(alert.deltaMonthly).toBe(700)
    // Both bills attributed, largest change first.
    expect(alert.contributors).toEqual([
      { expenseId: bill.id, name: 'Broadband', deltaMonthly: 500 },
      { expenseId: phone.id, name: 'Phone', deltaMonthly: 200 },
    ])
  })

  it('normalises non-monthly bills to a monthly requirement', async () => {
    const { caller, pot } = await setup()
    const insurance = await caller.expenses.create({
      name: 'Car insurance',
      recurrence: 'yearly',
      amount: 24000, // £240/yr = £20/mo
      funding: 'pot_manual',
      potId: pot.id,
    })

    await caller.expenses.update({ id: insurance.id, amount: 36000 }) // £360/yr = £30/mo

    const alert = (await caller.standingOrders.alerts()).find((a) => a.potId === pot.id)!
    // Baseline pot total: 3000 (Broadband) + 2000 (insurance monthly) = 5000; now 3000 + 3000.
    expect(alert.wasMonthly).toBe(5000)
    expect(alert.nowMonthly).toBe(6000)
    expect(alert.contributors).toEqual([{ expenseId: insurance.id, name: 'Car insurance', deltaMonthly: 1000 }])
  })

  it('ignores pot_auto and main bills — they have no standing order', async () => {
    const { caller } = await setup()
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const autoPot = await caller.pots.create({ name: 'Auto Pot', ownerId: joint.id })
    const category = await caller.categories.create({ name: 'Utilities' })

    const auto = await caller.expenses.create({
      name: 'Netflix',
      recurrence: 'monthly',
      amount: 1000,
      funding: 'pot_auto',
      potId: autoPot.id,
    })
    const main = await caller.expenses.create({
      name: 'Council tax',
      recurrence: 'monthly',
      amount: 15000,
      funding: 'main',
      categoryId: category.id,
    })

    await caller.expenses.update({ id: auto.id, amount: 1200 })
    await caller.expenses.update({ id: main.id, amount: 16000 })

    // Neither seeded a baseline, so nothing is stale.
    expect(await caller.standingOrders.alerts()).toEqual([])
  })

  it('acknowledge can be used proactively before any change', async () => {
    const { caller, pot, bill } = await setup()

    // Mark the current requirement as set up, then change a bill.
    await caller.standingOrders.acknowledge({ potId: pot.id })
    await caller.expenses.update({ id: bill.id, amount: 3400 })

    const alerts = await caller.standingOrders.alerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.wasMonthly).toBe(3000)
    expect(alerts[0]!.nowMonthly).toBe(3400)
  })
})
