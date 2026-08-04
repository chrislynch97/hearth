import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from './testdb'
import { seedDev, hasDevData, DEV_HOUSEHOLD_IDS, DEV_LOGIN, DEV_PASSWORD, DEV_INVITE_TOKEN } from './dev'
import { getInstanceSettings } from './instanceSettings'
import { verifyPassword } from '../auth/password'
import { hashToken } from '../auth/bearer'
import { validatePassword } from '../../shared/password-policy'
import { ALL_TABLES } from './tables'
import { household, invitation, member, membership, user } from './schema'

// A fixed reference date keeps the deterministic dataset stable across CI clocks.
const NOW = Date.UTC(2026, 5, 15) // 2026-06-15

describe('dev fixture', () => {
  it('seeds every household, with the primary one first', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    const households = await db.select().from(household)
    expect(households.map((h) => h.id).sort()).toEqual(Object.values(DEV_HOUSEHOLD_IDS).sort())
    // All past the setup wizard, so every login lands in the app.
    expect(households.every((h) => h.setupCompletedAt != null)).toBe(true)
    expect(await hasDevData(db)).toBe(true)
  })

  it('gives the households different shapes to exercise', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    const [ivy] = await db.select().from(household).where(eq(household.id, DEV_HOUSEHOLD_IDS.ivy))
    const [harbour] = await db.select().from(household).where(eq(household.id, DEV_HOUSEHOLD_IDS.harbour))
    expect(ivy?.budgetPeriodFrequency).toBe('four_weekly')
    expect(ivy?.budgetPeriodAnchor).not.toBeNull()
    expect(harbour?.currencyCode).toBe('EUR')
    expect(harbour?.jointFundingModel).toBe('pooled')

    // One person plus the joint entity in Ivy Cottage; two plus joint elsewhere.
    const ivyMembers = await db.select().from(member).where(eq(member.householdId, DEV_HOUSEHOLD_IDS.ivy))
    expect(ivyMembers.filter((m) => m.kind === 'person')).toHaveLength(1)
    expect(ivyMembers.filter((m) => m.kind === 'joint')).toHaveLength(1)
  })

  it('scopes every row to a seeded household', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    const ids: string[] = Object.values(DEV_HOUSEHOLD_IDS)
    for (const [name, table] of ALL_TABLES) {
      if (name === 'household') continue
      const rows = (await db.select().from(table)) as Array<Record<string, unknown>>
      for (const row of rows) {
        if (!('householdId' in row)) continue
        expect(ids, `${name} row scoped to an unknown household`).toContain(row['householdId'])
      }
    }
  })

  it('mints unique ids across households', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    // The generator derives ids from its PRNG, so two households sharing a seed
    // would collide. Insert order hides that (the FK-ordered insert would throw),
    // so assert it directly across the tenant-scoped tables.
    for (const [name, table] of ALL_TABLES) {
      const rows = (await db.select().from(table)) as Array<Record<string, unknown>>
      const ids = rows.map((r) => r['id']).filter((v) => typeof v === 'string')
      expect(new Set(ids).size, `${name} has duplicate ids`).toBe(ids.length)
    }
  })

  it('locks the instance behind accounts that share DEV_PASSWORD', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    // The documented password must satisfy the real policy — otherwise changing
    // it through the UI would behave differently from the seeded one.
    expect(validatePassword(DEV_PASSWORD)).toBeNull()

    const users = await db.select().from(user)
    expect(users.length).toBeGreaterThan(1)
    for (const u of users) {
      expect(u.passwordHash).not.toBeNull()
      expect(await verifyPassword(DEV_PASSWORD, u.passwordHash!)).toBe(true)
    }

    const settings = await getInstanceSettings(db)
    expect(settings.authRequired).toBe(true)
    const [owner] = await db.select().from(user).where(eq(user.username, DEV_LOGIN))
    expect(settings.ownerUserId).toBe(owner?.id)
  })

  it('puts the dev login in every household, with a different role in each', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    const [owner] = await db.select().from(user).where(eq(user.username, DEV_LOGIN))
    const grants = await db.select().from(membership).where(eq(membership.userId, owner!.id))
    expect(grants.map((g) => g.householdId).sort()).toEqual(Object.values(DEV_HOUSEHOLD_IDS).sort())
    expect(new Set(grants.map((g) => g.role)).size).toBe(grants.length)
    expect(grants.every((g) => g.acceptedAt != null)).toBe(true)

    // The owner is linked to their budgeting member, so "my pots" resolves.
    const [linked] = await db.select().from(member).where(eq(member.userId, owner!.id))
    expect(linked?.householdId).toBe(DEV_HOUSEHOLD_IDS.maple)
  })

  it('leaves a pending invitation to accept', async () => {
    const db = await makeTestDb()
    await seedDev(db, { now: NOW })

    // Every seeded grant is accepted: the access screen hides unaccepted ones, so
    // a pending membership would be an invisible row and an account that 403s.
    expect((await db.select().from(membership)).every((m) => m.acceptedAt != null)).toBe(true)

    const [invite] = await db.select().from(invitation)
    expect(invite?.householdId).toBe(DEV_HOUSEHOLD_IDS.maple)
    expect(invite?.acceptedAt).toBeNull()
    expect(invite?.expiresAt.getTime()).toBeGreaterThan(NOW)
    // The documented token is the one that opens it.
    expect(invite?.tokenHash).toBe(hashToken(DEV_INVITE_TOKEN))
  })

  it('re-seeding is idempotent (wipes, no duplicate rows)', async () => {
    const db = await makeTestDb()
    const first = await seedDev(db, { now: NOW })
    const second = await seedDev(db, { now: NOW })
    expect(second).toEqual(first)
    expect(await db.select().from(household)).toHaveLength(Object.keys(DEV_HOUSEHOLD_IDS).length)
  })
})
