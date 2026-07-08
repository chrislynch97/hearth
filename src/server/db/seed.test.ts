import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from './testdb'
import { ensureSeed } from './seed'
import { household, member, membership, user } from './schema'
import { hashPassword } from '../auth/password'

describe('ensureSeed', () => {
  it('creates the singleton household and exactly one joint member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const households = await db.select().from(household)
    expect(households).toHaveLength(1)
    expect(households[0]!.currencyCode).toBe('GBP')

    const joints = await db.select().from(member).where(eq(member.kind, 'joint'))
    expect(joints).toHaveLength(1)
  })

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await ensureSeed(db)

    expect(await db.select().from(household)).toHaveLength(1)
    expect(await db.select().from(member).where(eq(member.kind, 'joint'))).toHaveLength(1)
    expect(await db.select().from(user)).toHaveLength(1)
    expect(await db.select().from(membership)).toHaveLength(1)
  })

  it('provisions an owner user + membership for the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const [owner] = await db.select().from(user)
    expect(owner?.username).toBe('owner')

    const [grant] = await db.select().from(membership)
    expect(grant?.role).toBe('owner')
    expect(grant?.userId).toBe(owner!.id)
    expect(grant?.householdId).toBe('household')
    expect(grant?.acceptedAt).not.toBeNull()
  })

  it('migrates an existing shared household password onto the owner user', async () => {
    const db = await makeTestDb()
    // Simulate an existing install whose password lived on the household row.
    const now = Date.now()
    const hash = hashPassword('correct horse battery staple')
    await db.insert(household).values({ id: 'household', passwordHash: hash, createdAt: now, updatedAt: now })

    await ensureSeed(db)

    const [owner] = await db.select().from(user)
    expect(owner?.passwordHash).toBe(hash)
  })
})
