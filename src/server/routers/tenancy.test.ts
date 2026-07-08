import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { household, member } from '../db/schema'
import { newId } from '../../shared/ids'

/** Two households in one database, each with a joint member to own pots/spends. */
async function twoHouseholds() {
  const db = await makeTestDb()
  await ensureSeed(db) // creates the 'household' singleton + its joint member
  const now = Date.now()
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
})
