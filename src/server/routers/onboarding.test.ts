import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { getOwnerUser } from '../auth/session'
import { appRouter } from '../trpc/router'
import { payslip } from '../db/schema'
import { newId } from '../../shared/ids'

async function ownerCaller() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const owner = await getOwnerUser(db)
  const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
  return { db, caller }
}

describe('onboarding router', () => {
  it('fresh household → not dismissed, no steps done', async () => {
    const { caller } = await ownerCaller()
    const status = await caller.onboarding.status()
    expect(status.dismissed).toBe(false)
    expect(status.steps).toEqual({ pots: false, payslips: false, setAsides: false })
  })

  it('steps tick off as the household is filled in', async () => {
    const { db, caller } = await ownerCaller()
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    const pot = await caller.pots.create({ name: 'Rent', ownerId: joint.id })
    expect((await caller.onboarding.status()).steps).toMatchObject({ pots: true, setAsides: false })

    await caller.setAside.create({
      name: 'Rent',
      ownerId: joint.id,
      potId: pot.id,
      amount: 50000,
      recurrence: 'monthly',
    })
    const now = new Date()
    await db.insert(payslip).values({
      id: newId(),
      householdId: 'household',
      ownerId: alice.id,
      payDate: '2026-01-25',
      createdAt: now,
      updatedAt: now,
    })

    expect((await caller.onboarding.status()).steps).toEqual({ pots: true, payslips: true, setAsides: true })
  })

  it('archived pot does not count', async () => {
    const { caller } = await ownerCaller()
    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Temp', ownerId: joint.id })
    expect((await caller.onboarding.status()).steps.pots).toBe(true)

    await caller.pots.archive({ id: pot.id })
    expect((await caller.onboarding.status()).steps.pots).toBe(false)
  })

  it('dismiss persists across calls', async () => {
    const { caller } = await ownerCaller()
    expect((await caller.onboarding.status()).dismissed).toBe(false)
    await caller.onboarding.dismiss()
    expect((await caller.onboarding.status()).dismissed).toBe(true)
  })

  it('dismiss without a user throws UNAUTHORIZED', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    await expect(caller.onboarding.dismiss()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('anonymous status is dismissed (never shown)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })
    const status = await caller.onboarding.status()
    expect(status.dismissed).toBe(true)
  })
})
