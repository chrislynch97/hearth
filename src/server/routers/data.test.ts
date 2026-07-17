import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { getOwnerUser } from '../auth/session'
import { appRouter } from '../trpc/router'
import { household, membership, user } from '../db/schema'
import { newId } from '../../shared/ids'

describe('data router', () => {
  it('export → import round-trips the whole database', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 4200, ownerId: alice.id, potId: pot.id })

    const snapshot = await caller.data.export()
    expect(snapshot.tables['pot']).toHaveLength(1)

    // Mutate away from the snapshot, then restore it.
    await caller.pots.create({ name: 'Extra Pot', ownerId: alice.id })
    expect(await caller.pots.list()).toHaveLength(2)

    const result = await caller.data.import(snapshot)
    expect(result['pot']).toBe(1)

    const potsAfter = await caller.pots.list()
    expect(potsAfter).toHaveLength(1)
    expect(potsAfter[0]?.name).toBe('Rent')
    const spends = await caller.spends.list()
    expect(spends).toHaveLength(1)
    expect(spends[0]?.description).toBe('Tesco')
  })

  it('importing an open snapshot into a locked instance restores the first-run screen (issue #63)', async () => {
    // Instance A is open (no owner password); its export carries users with null
    // password hashes.
    const dbA = await makeTestDb()
    await ensureSeed(dbA)
    const ownerA = await getOwnerUser(dbA)
    const callerA = appRouter.createCaller({ db: dbA, householdId: 'household', role: 'owner', userId: ownerA!.id })
    const openSnapshot = await callerA.data.export()

    // Instance B is locked: setting the owner password persists auth_required.
    const dbB = await makeTestDb()
    await ensureSeed(dbB)
    const ownerB = await getOwnerUser(dbB)
    const callerB = appRouter.createCaller({ db: dbB, householdId: 'household', role: 'owner', userId: ownerB!.id })
    await callerB.auth.setPassword({ newPassword: 'correct horse battery staple' })
    expect((await callerB.auth.status()).passwordSet).toBe(true)

    // Restoring A's open snapshot must not strand B behind a password that no
    // account carries anymore — the instance reopens to the first-run screen.
    await callerB.data.import(openSnapshot)

    const status = await callerB.auth.status()
    expect(status.passwordSet).toBe(false)
    expect(status.firstRunRequired).toBe(true)
  })

  it('import rejects a snapshot with no household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await expect(caller.data.import({ version: 1, tables: { household: [] } })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('reset wipes data and returns to a fresh, setup-incomplete household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    await caller.members.addPerson({ displayName: 'Alice' })
    await caller.household.completeSetup()
    await caller.categories.create({ name: 'Bills' })

    await caller.data.reset()

    expect(await caller.categories.list()).toEqual([])
    const ctx = await caller.bootstrap.context()
    expect(ctx.needsSetup).toBe(true)
    // Only the seeded joint member remains.
    expect(ctx.members.filter((m) => m.kind === 'person')).toEqual([])
    expect(ctx.members.some((m) => m.kind === 'joint')).toBe(true)
  })

  it('rescaleCurrency scales every money column and updates the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 1250, ownerId: alice.id, potId: pot.id })

    await caller.data.rescaleCurrency({ decimalPlaces: 3 }) // 2dp → 3dp, ×10

    const spends = await caller.spends.list()
    expect(spends[0]?.amount).toBe(12500)
    const ctx = await caller.bootstrap.context()
    expect(ctx.household?.currencyDecimalPlaces).toBe(3)
  })

  it('rescaleCurrency requires the admin role (a member cannot rewrite every amount)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const member = appRouter.createCaller({ db, householdId: 'household', role: 'member', userId: owner!.id })
    await expect(member.data.rescaleCurrency({ decimalPlaces: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('restricts instance-wide ops (export/import/reset/stats) to the instance owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    // A user who owns a DIFFERENT household, not the primary one.
    const now = new Date()
    const outsiderId = newId()
    await db.insert(user).values({ id: outsiderId, username: 'out', displayName: 'Out', createdAt: now, updatedAt: now })
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: outsiderId,
      householdId: 'h2',
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const outsider = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: outsiderId })
    await expect(outsider.data.export()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(outsider.data.reset()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(outsider.data.stats()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      outsider.data.import({ version: 1, tables: { household: [{ id: 'x' }] } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('stats reports per-table counts', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await caller.members.addPerson({ displayName: 'Alice' })

    const stats = await caller.data.stats()
    expect(stats.counts['household']).toBe(1)
    expect(stats.counts['member']).toBe(2) // joint + Alice
  })
})
