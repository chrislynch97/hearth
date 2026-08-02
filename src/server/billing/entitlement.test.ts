import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { household, subscription } from '../db/schema'
import type { DB } from '../db/client'
import { getEntitlement } from './entitlement'

const NOW = new Date('2026-08-02T12:00:00Z')
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000)

async function makeHousehold(db: DB, id = 'h1'): Promise<string> {
  await db.insert(household).values({ id, createdAt: NOW, updatedAt: NOW })
  return id
}

async function subscribe(db: DB, householdId: string, row: Partial<typeof subscription.$inferInsert>) {
  await db.insert(subscription).values({
    householdId,
    provider: 'paddle',
    plan: 'household',
    status: 'active',
    updatedAt: NOW,
    ...row,
  })
}

describe('getEntitlement', () => {
  it('reports `none` when there is no subscription row — the self-host default', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)

    expect(await getEntitlement(db, id, NOW)).toEqual({ status: 'none', plan: null, activeUntil: null })
  })

  it('reports `active` with the paid-through date', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'active', currentPeriodEnd: days(20) })

    expect(await getEntitlement(db, id, NOW)).toEqual({
      status: 'active',
      plan: 'household',
      activeUntil: days(20),
    })
  })

  it('reports `grace` while a failed payment is inside its window', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'past_due', graceUntil: days(9), currentPeriodEnd: days(-5) })

    expect(await getEntitlement(db, id, NOW)).toEqual({
      status: 'grace',
      plan: 'household',
      activeUntil: days(9),
    })
  })

  it('reports `past_due` once the grace window has passed', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'past_due', graceUntil: days(-1) })

    expect(await getEntitlement(db, id, NOW)).toEqual({
      status: 'past_due',
      plan: 'household',
      activeUntil: null,
    })
  })

  it('reports `past_due` when a failed payment was given no grace window at all', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'past_due', graceUntil: null })

    expect((await getEntitlement(db, id, NOW)).status).toBe('past_due')
  })

  it('keeps a cancelled subscription active to the end of the period it paid for', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'cancelled', cancelAt: NOW, currentPeriodEnd: days(12) })

    // Cancelling mid-period must not revoke access — they paid for it (#235).
    expect(await getEntitlement(db, id, NOW)).toEqual({
      status: 'active',
      plan: 'household',
      activeUntil: days(12),
    })
    expect(await getEntitlement(db, id, days(13))).toEqual({
      status: 'cancelled',
      plan: 'household',
      activeUntil: null,
    })
  })

  it('answers per household, so one lapsed and one paid household differ in the same instance', async () => {
    const db = await makeTestDb()
    const lapsed = await makeHousehold(db, 'lapsed')
    const paid = await makeHousehold(db, 'paid')
    await subscribe(db, lapsed, { status: 'past_due', graceUntil: days(-1) })
    await subscribe(db, paid, {
      status: 'active',
      currentPeriodEnd: days(20),
      providerSubscriptionId: 'sub_2',
    })

    expect((await getEntitlement(db, lapsed, NOW)).status).toBe('past_due')
    expect((await getEntitlement(db, paid, NOW)).status).toBe('active')
  })

  it('fails closed on a status nothing in the app can write', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'lifetime_free' })

    expect((await getEntitlement(db, id, NOW)).status).toBe('none')
  })
})

describe('subscription lifetime', () => {
  it('goes away with the household it belongs to', async () => {
    const db = await makeTestDb()
    const id = await makeHousehold(db)
    await subscribe(db, id, { status: 'active' })

    await db.delete(household).where(eq(household.id, id))

    expect(await db.select().from(subscription)).toEqual([])
  })
})
