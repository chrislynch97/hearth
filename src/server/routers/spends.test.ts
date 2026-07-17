import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { expense } from '../db/schema'

describe('spends router — needsPot filter', () => {
  it('excludes main-account (settled, pot-less) spends from "needs a pot"', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const cat = await caller.categories.create({ name: 'Subscriptions' })

    // Genuinely unassigned — should be flagged.
    await caller.spends.add({ description: 'Cash', amount: 4000, ownerId: joint.id, potId: null })
    // Main account — pot-less but settled at source; must NOT be flagged.
    await caller.spends.add({
      description: 'Spotify',
      amount: 1200,
      ownerId: joint.id,
      potId: null,
      categoryId: cat.id,
      settledAtSource: true,
    })

    const needsPot = await caller.spends.list({ needsPot: true })
    expect(needsPot.map((s) => s.description)).toEqual(['Cash'])
  })
})

describe('spends router — split', () => {
  it('splits a spend into rows that sum to the original, sharing a group id', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const groceries = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })
    const treats = await caller.pots.create({ name: 'Treats', ownerId: alice.id })

    const s = await caller.spends.add({ description: 'Big shop', amount: 5000, ownerId: joint.id, potId: groceries.id })
    const group = await caller.spends.split({
      id: s.id,
      parts: [
        { amount: 3000, ownerId: joint.id, potId: groceries.id },
        { amount: 2000, ownerId: alice.id, potId: treats.id },
      ],
    })

    expect(group).toHaveLength(2)
    expect(group.reduce((a, r) => a + r.amount, 0)).toBe(5000)
    expect(new Set(group.map((r) => r.splitGroupId)).size).toBe(1)
    expect(group.every((r) => r.description === 'Big shop' && r.date === s.date)).toBe(true)
    // The original row is reused as one of the parts.
    expect(group.some((r) => r.id === s.id)).toBe(true)
  })

  it('rejects a split that does not sum to the original', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const s = await caller.spends.add({ description: 'X', amount: 5000, ownerId: joint.id })
    await expect(
      caller.spends.split({
        id: s.id,
        parts: [
          { amount: 3000, ownerId: joint.id },
          { amount: 1000, ownerId: joint.id },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('refuses to split a reconciled spend', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'P', ownerId: joint.id })
    const s = await caller.spends.add({ description: 'X', amount: 4000, ownerId: joint.id, potId: pot.id })
    await caller.reconcile.markPotMoved({ potId: pot.id })
    await expect(
      caller.spends.split({
        id: s.id,
        parts: [
          { amount: 2000, ownerId: joint.id, potId: pot.id },
          { amount: 2000, ownerId: joint.id, potId: pot.id },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('spends router — expense link (#67)', () => {
  async function setup() {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Bills', ownerId: joint.id })
    const bill = await caller.expenses.create({
      name: 'Netflix', recurrence: 'monthly', amount: 1099, funding: 'pot_manual', potId: pot.id,
    })
    return { db, caller, joint, pot, bill }
  }

  it('add persists expenseId when logged from a bill', async () => {
    const { caller, joint, pot, bill } = await setup()
    const s = await caller.spends.add({
      description: 'Netflix', amount: 1099, ownerId: joint.id, potId: pot.id, expenseId: bill.id,
    })
    expect(s.expenseId).toBe(bill.id)
  })

  it('add leaves expenseId null for an ad-hoc spend', async () => {
    const { caller, joint } = await setup()
    const s = await caller.spends.add({ description: 'Cash', amount: 500, ownerId: joint.id })
    expect(s.expenseId).toBeNull()
  })

  it('add with a bogus expenseId throws BAD_REQUEST', async () => {
    const { caller, joint } = await setup()
    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: joint.id, expenseId: 'nope' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('update re-points a spend at a different bill', async () => {
    const { caller, joint, pot, bill } = await setup()
    const other = await caller.expenses.create({
      name: 'Spotify', recurrence: 'monthly', amount: 1200, funding: 'pot_manual', potId: pot.id,
    })
    const s = await caller.spends.add({
      description: 'Netflix', amount: 1099, ownerId: joint.id, potId: pot.id, expenseId: bill.id,
    })
    const updated = await caller.spends.update({ id: s.id, expenseId: other.id })
    expect(updated.expenseId).toBe(other.id)

    const cleared = await caller.spends.update({ id: s.id, expenseId: null })
    expect(cleared.expenseId).toBeNull()
  })

  it('split inherits the parent expenseId across every part', async () => {
    const { caller, joint, pot, bill } = await setup()
    const s = await caller.spends.add({
      description: 'Netflix', amount: 1000, ownerId: joint.id, potId: pot.id, expenseId: bill.id,
    })
    const group = await caller.spends.split({
      id: s.id,
      parts: [
        { amount: 600, ownerId: joint.id, potId: pot.id },
        { amount: 400, ownerId: joint.id, potId: pot.id },
      ],
    })
    expect(group.every((r) => r.expenseId === bill.id)).toBe(true)
  })

  it('deleting a bill nulls the link but keeps the payment history (onDelete set null)', async () => {
    const { db, caller, joint, pot, bill } = await setup()
    const s = await caller.spends.add({
      description: 'Netflix', amount: 1099, ownerId: joint.id, potId: pot.id, expenseId: bill.id,
    })
    await db.delete(expense).where(eq(expense.id, bill.id))

    const list = await caller.spends.list({})
    const row = list.find((t) => t.id === s.id)
    expect(row).toBeDefined()
    expect(row?.expenseId).toBeNull()
  })
})

describe('spends router', () => {
  it('add with a pot → list returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    const s = await caller.spends.add({
      description: 'Tesco',
      amount: 2500,
      ownerId: joint.id,
      potId: pot.id,
    })

    expect(s.id).toBeTruthy()
    expect(s.description).toBe('Tesco')
    expect(s.amount).toBe(2500)
    expect(s.potId).toBe(pot.id)
    expect(s.reconciled).toBe(0)
    expect(s.source).toBe('manual')

    const list = await caller.spends.list({})
    expect(list.length).toBe(1)
    expect(list[0]?.id).toBe(s.id)
  })

  it('caps the result at `limit`, newest first (register pagination, #15)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    for (let i = 0; i < 5; i++) {
      await caller.spends.add({ date: `2026-07-0${i + 1}`, description: `s${i}`, amount: 100, ownerId: joint.id })
    }

    const all = await caller.spends.list({})
    expect(all.length).toBe(5)

    const page = await caller.spends.list({ limit: 2 })
    expect(page.length).toBe(2)
    // Ordered by date desc, so the newest two (07-05, 07-04) come back.
    expect(page.map((s) => s.date)).toEqual(['2026-07-05', '2026-07-04'])
  })

  it('add without a pot → list({needsPot:true}) returns it', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    const s = await caller.spends.add({
      description: 'Unknown shop',
      amount: 1000,
      ownerId: joint.id,
    })

    expect(s.potId).toBeNull()

    const needsPot = await caller.spends.list({ needsPot: true })
    expect(needsPot.map((t) => t.id)).toContain(s.id)
  })

  it('add with a bogus ownerId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('add with a bogus potId throws BAD_REQUEST', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    await expect(
      caller.spends.add({ description: 'X', amount: 100, ownerId: joint.id, potId: 'bad-pot' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('suggestPot returns a previously-used pot for a repeated description', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })

    const suggestion = await caller.spends.suggestPot({ description: 'tesco', ownerId: joint.id })
    expect(suggestion).toEqual({ potId: pot.id })
  })

  it('update changes fields and remove deletes the row', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })

    const s = await caller.spends.add({ description: 'Tesco', amount: 2500, ownerId: joint.id, potId: pot.id })

    const updated = await caller.spends.update({ id: s.id, description: 'Tesco Express', amount: 3000 })
    expect(updated.description).toBe('Tesco Express')
    expect(updated.amount).toBe(3000)

    const removed = await caller.spends.remove({ id: s.id })
    expect(removed).toEqual({ id: s.id })

    const list = await caller.spends.list({})
    expect(list.find((t) => t.id === s.id)).toBeUndefined()
  })
})
