import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('bill price history (issue #68)', () => {
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

  it('records a change and seeds the starting price the first time', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({
      id: bill.id,
      amount: 3500,
      priceSource: 'spend_prompt',
      priceEffectiveDate: '2026-07-01',
    })

    const history = await caller.billPrices.list({ expenseId: bill.id })
    expect(history).toHaveLength(2)
    // Seed row at the old price, then the confirmed change, oldest-first.
    expect(history[0]?.amount).toBe(3000)
    expect(history[0]?.source).toBe('manual')
    expect(history[0]?.note).toBe('Starting price')
    expect(history[1]?.amount).toBe(3500)
    expect(history[1]?.source).toBe('spend_prompt')
    expect(history[1]?.effectiveDate).toBe('2026-07-01')
  })

  it('a manual edit defaults the source to manual', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({ id: bill.id, amount: 4000 })

    const history = await caller.billPrices.list({ expenseId: bill.id })
    expect(history.map((h) => h.amount)).toEqual([3000, 4000])
    expect(history[1]?.source).toBe('manual')
  })

  it('does not seed again on the second change', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({ id: bill.id, amount: 3500 })
    await caller.expenses.update({ id: bill.id, amount: 3800 })

    const history = await caller.billPrices.list({ expenseId: bill.id })
    // seed(3000) + change(3500) + change(3800) — no second seed.
    expect(history.map((h) => h.amount)).toEqual([3000, 3500, 3800])
  })

  it('records nothing when the amount is unchanged', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({ id: bill.id, name: 'Fibre', amount: 3000 })

    const history = await caller.billPrices.list({ expenseId: bill.id })
    expect(history).toHaveLength(0)
  })

  it('records nothing when the amount is not part of the update', async () => {
    const { caller, bill } = await setup()

    await caller.expenses.update({ id: bill.id, note: 'renewed' })

    const history = await caller.billPrices.list({ expenseId: bill.id })
    expect(history).toHaveLength(0)
  })

  it('scopes list to the requested bill', async () => {
    const { caller, pot, bill } = await setup()
    const other = await caller.expenses.create({
      name: 'Phone',
      recurrence: 'monthly',
      amount: 1000,
      funding: 'pot_manual',
      potId: pot.id,
    })

    await caller.expenses.update({ id: bill.id, amount: 3500 })
    await caller.expenses.update({ id: other.id, amount: 1200 })

    const forBill = await caller.billPrices.list({ expenseId: bill.id })
    expect(forBill.every((h) => h.expenseId === bill.id)).toBe(true)
    expect(await caller.billPrices.list()).toHaveLength(4) // both bills' seed + change
  })
})
