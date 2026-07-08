import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { member } from '../db/schema'
import { newId } from '../../shared/ids'

describe('household router', () => {
  it('update changes displayName and currencyCode and they persist', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const updated = await caller.household.update({
      displayName: 'The Lynchs',
      currencyCode: 'USD',
      currencySymbol: '$',
    })

    expect(updated.displayName).toBe('The Lynchs')
    expect(updated.currencyCode).toBe('USD')
    expect(updated.currencySymbol).toBe('$')

    // Re-query via bootstrap to confirm persistence
    const ctx = await caller.bootstrap.context()
    expect(ctx.household?.displayName).toBe('The Lynchs')
    expect(ctx.household?.currencyCode).toBe('USD')
  })

  it('update sets updatedAt', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const before = Date.now()
    const updated = await caller.household.update({ locale: 'en-US' })
    const after = Date.now()

    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
    expect(updated.updatedAt).toBeLessThanOrEqual(after)
  })

  it('update accepts all optional fields', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const updated = await caller.household.update({
      displayName: 'Home',
      currencyCode: 'EUR',
      currencySymbol: '€',
      currencyDecimalPlaces: 2,
      locale: 'fr-FR',
      budgetPeriodStartDay: 15,
      themePreference: 'dark',
      incomeBasisDefault: 'rolling_12m',
      jointContributionBasis: 'income_proportional',
    })

    expect(updated.themePreference).toBe('dark')
    expect(updated.budgetPeriodStartDay).toBe(15)
    expect(updated.incomeBasisDefault).toBe('rolling_12m')
    expect(updated.jointContributionBasis).toBe('income_proportional')
  })

  it('completeSetup throws PRECONDITION_FAILED when no person member exists', async () => {
    const db = await makeTestDb()
    await ensureSeed(db) // only joint member exists
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    await expect(caller.household.completeSetup()).rejects.toThrow(TRPCError)
    await expect(caller.household.completeSetup()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('completeSetup sets setupCompletedAt after a person is added', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    // Add a person member directly
    const now = Date.now()
    await db.insert(member).values({
      id: newId(),
      kind: 'person',
      displayName: 'Alice',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    })

    const before = Date.now()
    const updated = await caller.household.completeSetup()
    const after = Date.now()

    expect(updated.setupCompletedAt).toBeGreaterThanOrEqual(before)
    expect(updated.setupCompletedAt).toBeLessThanOrEqual(after)
  })

  it('completeSetup throws if only archived person exists', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household' })

    const now = Date.now()
    await db.insert(member).values({
      id: newId(),
      kind: 'person',
      displayName: 'Bob',
      sortOrder: 1,
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(caller.household.completeSetup()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })
})
