import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

async function setup(role: 'owner' | 'viewer' = 'owner') {
  const db = await makeTestDb()
  await ensureSeed(db)
  return appRouter.createCaller({ db, householdId: 'household', role })
}

describe('gifts router', () => {
  it('rolls gifts up into per-person and per-occasion totals', async () => {
    const caller = await setup()
    const xmas = await caller.gifts.createOccasion({ name: 'Christmas 2026', date: '2026-12-25', budget: 30000 })
    const mum = await caller.gifts.createRecipient({ occasionId: xmas.id, name: 'Mum', budget: 10000 })
    const dad = await caller.gifts.createRecipient({ occasionId: xmas.id, name: 'Dad' })
    await caller.gifts.createGift({ recipientId: mum.id, name: 'Scarf', amount: 4000, status: 'bought' })
    await caller.gifts.createGift({ recipientId: mum.id, name: 'Book', amount: 1500, status: 'idea' })
    await caller.gifts.createGift({ recipientId: dad.id, name: 'Whisky', amount: 6000, status: 'given' })

    const detail = await caller.gifts.occasion({ id: xmas.id })
    expect(detail.totals).toEqual({ budget: 30000, spent: 10000, planned: 1500, left: 20000 })
    expect(detail.recipients.map((r) => r.name)).toEqual(['Mum', 'Dad'])
    expect(detail.recipients[0]?.totals).toEqual({ budget: 10000, spent: 4000, planned: 1500, left: 6000 })
    expect(detail.recipients[1]?.totals.left).toBeNull()

    const [summary] = await caller.gifts.occasions()
    expect(summary?.totals.spent).toBe(10000)
  })

  it('copies people and their budgets, not gifts, from a previous occasion', async () => {
    const caller = await setup()
    const last = await caller.gifts.createOccasion({ name: 'Christmas 2025' })
    const gran = await caller.gifts.createRecipient({ occasionId: last.id, name: 'Gran', budget: 2500 })
    await caller.gifts.createGift({ recipientId: gran.id, name: 'Slippers', amount: 2000, status: 'given' })

    const next = await caller.gifts.createOccasion({ name: 'Christmas 2026', copyFromId: last.id })
    const detail = await caller.gifts.occasion({ id: next.id })
    expect(detail.recipients).toHaveLength(1)
    expect(detail.recipients[0]).toMatchObject({ name: 'Gran', budget: 2500, gifts: [] })
    expect(detail.recipients[0]?.id).not.toBe(gran.id)

    // Renaming in the new year leaves last year alone.
    await caller.gifts.updateRecipient({ id: detail.recipients[0]!.id, name: 'Granny' })
    expect((await caller.gifts.occasion({ id: last.id })).recipients[0]?.name).toBe('Gran')
  })

  it("raises the occasion budget when people's budgets go past it", async () => {
    const caller = await setup()
    const xmas = await caller.gifts.createOccasion({ name: 'Christmas', budget: 10000 })
    const mum = await caller.gifts.createRecipient({ occasionId: xmas.id, name: 'Mum', budget: 6000 })
    expect(mum.raisedOccasionBudget).toBeNull()

    const dad = await caller.gifts.createRecipient({ occasionId: xmas.id, name: 'Dad', budget: 5000 })
    expect(dad.raisedOccasionBudget).toBe(11000)

    const raised = await caller.gifts.updateRecipient({ id: mum.id, budget: 7000 })
    expect(raised.raisedOccasionBudget).toBe(12000)
    const detail = await caller.gifts.occasion({ id: xmas.id })
    expect(detail.budget).toBe(12000)
    expect(detail.allocated).toBe(12000)

    // Lowering a person never lowers the occasion.
    expect((await caller.gifts.updateRecipient({ id: mum.id, budget: 1000 })).raisedOccasionBudget).toBeNull()
    expect((await caller.gifts.occasion({ id: xmas.id })).budget).toBe(12000)
  })

  it('leaves an occasion with no budget alone, and covers copied budgets', async () => {
    const caller = await setup()
    const open = await caller.gifts.createOccasion({ name: 'Birthday' })
    const r = await caller.gifts.createRecipient({ occasionId: open.id, name: 'Sam', budget: 9000 })
    expect(r.raisedOccasionBudget).toBeNull()
    expect((await caller.gifts.occasion({ id: open.id })).budget).toBeNull()

    const next = await caller.gifts.createOccasion({ name: 'Next birthday', budget: 5000, copyFromId: open.id })
    expect(next).toMatchObject({ budget: 9000, raisedOccasionBudget: 9000 })
  })

  it('moves a gift only between people on the same occasion', async () => {
    const caller = await setup()
    const a = await caller.gifts.createOccasion({ name: 'A' })
    const b = await caller.gifts.createOccasion({ name: 'B' })
    const amy = await caller.gifts.createRecipient({ occasionId: a.id, name: 'Amy' })
    const ali = await caller.gifts.createRecipient({ occasionId: a.id, name: 'Ali' })
    const bob = await caller.gifts.createRecipient({ occasionId: b.id, name: 'Bob' })
    const g = await caller.gifts.createGift({ recipientId: amy.id, name: 'Mug', amount: 800, status: 'idea' })

    await expect(caller.gifts.updateGift({ id: g.id, recipientId: bob.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const moved = await caller.gifts.updateGift({ id: g.id, recipientId: ali.id, status: 'bought' })
    expect(moved).toMatchObject({ recipientId: ali.id, status: 'bought' })
  })

  it('refuses a stale edit', async () => {
    const caller = await setup()
    const o = await caller.gifts.createOccasion({ name: 'Birthday' })
    await caller.gifts.updateOccasion({ id: o.id, budget: 5000 })
    await expect(
      caller.gifts.updateOccasion({ id: o.id, expectedUpdatedAt: o.updatedAt, name: 'Late' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('archives, restores and deletes an occasion with everything under it', async () => {
    const caller = await setup()
    const o = await caller.gifts.createOccasion({ name: 'Christmas 2024' })
    const r = await caller.gifts.createRecipient({ occasionId: o.id, name: 'Sam' })
    const g = await caller.gifts.createGift({ recipientId: r.id, name: 'Lego', amount: 3000, status: 'given' })

    expect((await caller.gifts.setArchived({ id: o.id, archived: true })).archivedAt).toBeInstanceOf(Date)
    expect((await caller.gifts.setArchived({ id: o.id, archived: false })).archivedAt).toBeNull()

    await caller.gifts.removeOccasion({ id: o.id })
    expect(await caller.gifts.occasions()).toHaveLength(0)
    await expect(caller.gifts.updateGift({ id: g.id, name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lets a viewer look but not edit', async () => {
    const viewer = await setup('viewer')
    expect(await viewer.gifts.occasions()).toEqual([])
    await expect(viewer.gifts.createOccasion({ name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
