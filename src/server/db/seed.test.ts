import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from './testdb'
import { ensureSeed } from './seed'
import { household, member } from './schema'

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
  })
})
