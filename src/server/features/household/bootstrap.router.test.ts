import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('bootstrap router', () => {
  it('health returns ok', async () => {
    const db = await makeTestDb()
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    expect(await caller.health()).toEqual({ status: 'ok' })
  })

  it('context returns the household, members, and needsSetup=true before setup', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const ctx = await caller.bootstrap.context()
    expect(ctx.household?.currencyCode).toBe('GBP')
    expect(ctx.members.some((m) => m.kind === 'joint')).toBe(true)
    expect(ctx.needsSetup).toBe(true)
  })
})
