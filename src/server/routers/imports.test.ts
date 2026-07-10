import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed, provisionHousehold } from '../db/seed'
import { appRouter } from '../trpc/router'

const CSV = [
  'Transaction ID,Date,Type,Name,Amount,Currency,Local currency,Category',
  'tx_1,04/07/2026,Card payment,Tesco,-12.50,GBP,GBP,Groceries',
  'tx_2,05/07/2026,Pot transfer,Savings,-100.00,GBP,GBP,Transfers',
  'tx_3,06/07/2026,Card payment,Paris Cafe,-8.00,EUR,EUR,Eating out',
  'tx_4,07/07/2026,Faster payment,Refund,4.00,GBP,GBP,General',
].join('\n')

describe('imports router', () => {
  it('previews Monzo CSV with classification and pot suggestions', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    const groceries = await caller.pots.create({ name: 'Groceries', ownerId: joint.id })
    // A prior Tesco spend trains the suggestion engine.
    await caller.spends.add({ description: 'Tesco', amount: 999, ownerId: joint.id, potId: groceries.id })

    const preview = await caller.imports.preview({ ownerId: joint.id, csvText: CSV })
    // tx_1 (new), tx_2 (pot transfer → excluded), tx_3 (EUR → foreign), tx_4 (refund → new)
    expect(preview.summary).toMatchObject({ total: 4, new: 2, excluded: 1, foreign: 1, duplicate: 0 })

    const tesco = preview.rows.find((r) => r.importRef === 'tx_1')!
    expect(tesco.status).toBe('new')
    expect(tesco.amount).toBe(1250)
    expect(tesco.suggestedPotId).toBe(groceries.id) // matched by description
  })

  it('commits chosen rows and dedups on re-import', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!

    const preview = await caller.imports.preview({ ownerId: joint.id, csvText: CSV })
    const importable = preview.rows
      .filter((r) => r.status === 'new' || r.status === 'foreign')
      .map((r) => ({
        importRef: r.importRef,
        date: r.date,
        description: r.description,
        amount: r.amount,
        potId: r.suggestedPotId,
        raw: r.raw,
      }))

    const result = await caller.imports.commit({
      ownerId: joint.id,
      filename: 'monzo.csv',
      totalRows: preview.summary.total,
      rows: importable,
    })
    expect(result.imported).toBe(3) // tx_1 + tx_4 (new) + tx_3 (foreign)

    const spends = await caller.spends.list()
    expect(spends.filter((s) => s.source === 'import')).toHaveLength(3)
    expect(spends.find((s) => s.importRef === 'tx_1')?.importBatchId).toBe(result.batchId)

    // Re-importing the same rows imports nothing (dedup by import_ref).
    const preview2 = await caller.imports.preview({ ownerId: joint.id, csvText: CSV })
    expect(preview2.summary.duplicate).toBe(3)
    const again = await caller.imports.commit({
      ownerId: joint.id,
      totalRows: preview2.summary.total,
      rows: importable,
    })
    expect(again.imported).toBe(0)
  })

  it('lets two households import the same Monzo transaction id (#15)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const secondId = await provisionHousehold(db, { displayName: 'Second' })

    const rows = [{ importRef: 'shared_tx', date: '2026-01-01', description: 'A', amount: 500 }]

    const h1 = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint1 = (await h1.members.list()).find((m) => m.kind === 'joint')!
    const r1 = await h1.imports.commit({ ownerId: joint1.id, totalRows: 1, rows })
    expect(r1.imported).toBe(1)

    // The same import_ref in a DIFFERENT household must not collide on the
    // (previously global) unique index.
    const h2 = appRouter.createCaller({ db, householdId: secondId, role: 'owner' })
    const joint2 = (await h2.members.list()).find((m) => m.kind === 'joint')!
    const r2 = await h2.imports.commit({ ownerId: joint2.id, totalRows: 1, rows })
    expect(r2.imported).toBe(1)
  })

  it('records a batch in history', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    const joint = (await caller.members.list()).find((m) => m.kind === 'joint')!
    await caller.imports.commit({
      ownerId: joint.id,
      filename: 'm.csv',
      totalRows: 1,
      rows: [{ importRef: 'x1', date: '2026-01-01', description: 'A', amount: 500 }],
    })
    const batches = await caller.imports.batches()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ source: 'monzo_csv', importedCount: 1, filename: 'm.csv' })
  })
})
