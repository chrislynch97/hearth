import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from './router'
import { household, member } from '../db/schema'
import { newId } from '../../shared/ids'

/** Two households in one database, each with a joint member to own pots/spends. */
async function twoHouseholds() {
  const db = await makeTestDb()
  await ensureSeed(db) // creates the 'household' singleton + its joint member
  const now = new Date()
  await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
  const h2Joint = newId()
  await db.insert(member).values({
    id: h2Joint,
    householdId: 'h2',
    kind: 'joint',
    displayName: 'Joint',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })

  const h1 = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
  const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner' })
  const h1Joint = (await h1.members.list()).find((m) => m.kind === 'joint')!
  return { db, h1, h2, h1Joint, h2Joint }
}

describe('cross-household isolation', () => {
  it('pots are not visible or mutable across households', async () => {
    const { h1, h2, h1Joint } = await twoHouseholds()

    const pot = await h1.pots.create({ name: 'Groceries', ownerId: h1Joint.id })

    // h2 sees none of h1's pots.
    expect(await h2.pots.list()).toHaveLength(0)

    // h2 can't update or archive h1's pot, even with its id.
    await expect(h2.pots.update({ id: pot.id, name: 'hijacked' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(h2.pots.archive({ id: pot.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // h2 can't create a pot owned by h1's member (owner must be in the caller's household).
    await expect(h2.pots.create({ name: 'X', ownerId: h1Joint.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    // h1's pot is untouched.
    expect((await h1.pots.list())[0]?.name).toBe('Groceries')
  })

  it('spends are isolated per household', async () => {
    const { h1, h2, h1Joint, h2Joint } = await twoHouseholds()

    const pot = await h1.pots.create({ name: 'Groceries', ownerId: h1Joint.id })
    const spend = await h1.spends.add({ description: 'Tesco', amount: 2500, ownerId: h1Joint.id, potId: pot.id })

    // h2's ledger is empty and stays empty when it tries to remove h1's spend.
    expect(await h2.spends.list({})).toHaveLength(0)
    await h2.spends.remove({ id: spend.id })
    expect((await h1.spends.list({}))[0]?.id).toBe(spend.id)

    // h2 can't attach a spend to h1's member or pot.
    await expect(
      h2.spends.add({ description: 'X', amount: 100, ownerId: h1Joint.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      h2.spends.add({ description: 'X', amount: 100, ownerId: h2Joint, potId: pot.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('gifts are isolated per household', async () => {
    const { h1, h2 } = await twoHouseholds()

    const xmas = await h1.gifts.createOccasion({ name: 'Christmas' })
    const mum = await h1.gifts.createRecipient({ occasionId: xmas.id, name: 'Mum' })
    const scarf = await h1.gifts.createGift({ recipientId: mum.id, name: 'Scarf', amount: 2000, status: 'idea' })

    expect(await h2.gifts.occasions()).toHaveLength(0)
    await expect(h2.gifts.occasion({ id: xmas.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h2.gifts.createRecipient({ occasionId: xmas.id, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      h2.gifts.createGift({ recipientId: mum.id, name: 'X', amount: 1, status: 'idea' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h2.gifts.updateGift({ id: scarf.id, name: 'hijacked' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(h2.gifts.createOccasion({ name: 'X', copyFromId: xmas.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(h2.gifts.removeOccasion({ id: xmas.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect((await h1.gifts.occasion({ id: xmas.id })).recipients[0]?.gifts[0]?.name).toBe('Scarf')
  })

  it('savings goals are isolated per household, pots included', async () => {
    const { h1, h2, h1Joint, h2Joint } = await twoHouseholds()

    const h1Pot = await h1.pots.create({ name: 'Kitchen', ownerId: h1Joint.id })
    const wedding = await h1.savings.createGoal({
      name: 'Wedding',
      targetAmount: 100_000,
      targetDate: '2028-06-12',
      pot: { name: 'Wedding', ownerId: h1Joint.id },
    })
    const cake = await h1.savings.createItem({ goalId: wedding.id, name: 'Cake', amount: 50_000 })
    const balance = await h1.savings.recordBalance({ goalId: wedding.id, asOfDate: '2026-10-01', amount: 10_000 })

    expect(await h2.savings.goals()).toHaveLength(0)
    expect(await h2.savings.eligiblePots()).toHaveLength(0)
    await expect(h2.savings.goal({ id: wedding.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      h2.savings.createGoal({ name: 'X', targetAmount: 1, targetDate: '2028-01-01', pot: { id: h1Pot.id } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      h2.savings.createGoal({ name: 'X', targetAmount: 1, targetDate: '2028-01-01', pot: { name: 'X', ownerId: h1Joint.id } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(h2.savings.createItem({ goalId: wedding.id, name: 'X', amount: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h2.savings.setPaid({ id: cake.id, paidOn: '2026-10-01', reduceTarget: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(h2.savings.removeBalance({ id: balance.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h2.savings.applyContribution({ goalId: wedding.id, perPeriod: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(h2.savings.removeGoal({ id: wedding.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // h2 can still make its own goal on its own pot.
    await h2.savings.createGoal({ name: 'Mine', targetAmount: 1, targetDate: '2028-01-01', pot: { name: 'Mine', ownerId: h2Joint } })

    const mine = await h1.savings.goal({ id: wedding.id })
    expect(mine.goal.targetAmount).toBe(100_000)
    expect(mine.items[0]?.paidOn).toBeNull()
  })
})
