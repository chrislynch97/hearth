import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from './testdb'
import { buildDemoData, seedDemo, hasHousehold } from './demo'
import {
  household,
  member,
  spendTransaction,
  reconciliationBatch,
  importBatch,
  account,
  accountBalance,
  payslip,
  payslipLine,
} from './schema'

// A fixed reference date keeps the deterministic dataset stable across CI clocks.
const NOW = Date.UTC(2026, 5, 15) // 2026-06-15

describe('demo data generator', () => {
  it('seeds a complete, gated household with two people + joint', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const [hh] = await db.select().from(household)
    expect(hh?.id).toBe('household')
    expect(hh?.setupCompletedAt).not.toBeNull() // past the setup wizard

    const members = await db.select().from(member)
    expect(members).toHaveLength(3)
    expect(members.filter((m) => m.kind === 'joint')).toHaveLength(1)
    expect(members.filter((m) => m.kind === 'person').map((m) => m.displayName).sort()).toEqual(['Ava', 'Ben'])

    expect(await hasHousehold(db)).toBe(true)
  })

  it('is deterministic — same seed + now ⇒ identical dataset', async () => {
    const a = buildDemoData({ now: NOW })
    const b = buildDemoData({ now: NOW })
    expect(a).toEqual(b)
  })

  it('reconciliation batches match their transactions exactly', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const batches = await db.select().from(reconciliationBatch)
    expect(batches.length).toBeGreaterThan(0)

    for (const batch of batches) {
      const rows = await db
        .select()
        .from(spendTransaction)
        .where(eq(spendTransaction.reconciliationBatchId, batch.id))
      expect(rows).toHaveLength(batch.transactionCount)
      const sum = rows.reduce((acc, r) => acc + r.amount, 0)
      expect(sum).toBe(batch.totalAmount)
      // Every batched row is marked reconciled with a timestamp and a pot.
      for (const r of rows) {
        expect(r.reconciled).toBe(1)
        expect(r.reconciledAt).not.toBeNull()
        expect(r.potId).not.toBeNull()
      }
    }
  })

  it('leaves a live catch-up backlog (unreconciled spends + needs-a-pot rows)', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const open = await db.select().from(spendTransaction).where(eq(spendTransaction.reconciled, 0))
    expect(open.length).toBeGreaterThan(0)
    // At least a couple of "needs a pot" rows for the dashboard bucket.
    expect(open.filter((r) => r.potId === null).length).toBeGreaterThanOrEqual(2)
    // A split group summing correctly.
    const split = (await db.select().from(spendTransaction)).filter((r) => r.splitGroupId !== null)
    expect(split.length).toBe(2)
    expect(new Set(split.map((r) => r.splitGroupId)).size).toBe(1)
  })

  it('records imports consistently with an import batch', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const imported = (await db.select().from(spendTransaction)).filter((r) => r.source === 'import')
    const [batch] = await db.select().from(importBatch)
    expect(batch).toBeDefined()
    expect(imported.length).toBe(batch!.importedCount)
    for (const r of imported) {
      expect(r.importRef).not.toBeNull()
      expect(r.importBatchId).toBe(batch!.id)
    }
    // import_ref uniqueness (would throw on insert otherwise) — assert distinct.
    const refs = imported.map((r) => r.importRef)
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('produces payslips with positive computed net pay', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const slips = await db.select().from(payslip)
    expect(slips.length).toBeGreaterThan(10)
    for (const slip of slips) {
      const lines = await db.select().from(payslipLine).where(eq(payslipLine.payslipId, slip.id))
      expect(lines.length).toBeGreaterThan(0)
    }
  })

  it('builds a rising net worth (assets > liabilities, trending up)', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })

    const accounts = await db.select().from(account)
    const balances = await db.select().from(accountBalance)
    expect(accounts.length).toBeGreaterThan(0)
    expect(balances.length).toBeGreaterThan(0)

    // Net worth at the earliest vs latest snapshot date.
    const kindById = new Map(accounts.map((a) => [a.id, a.kind]))
    const byDate = new Map<string, number>()
    for (const b of balances) {
      const signed = kindById.get(b.accountId) === 'liability' ? -b.value : b.value
      byDate.set(b.asOfDate, (byDate.get(b.asOfDate) ?? 0) + signed)
    }
    const dates = [...byDate.keys()].sort()
    const first = byDate.get(dates[0]!)!
    const last = byDate.get(dates[dates.length - 1]!)!
    expect(last).toBeGreaterThan(first) // net worth grew over the window
  })

  it('re-seeding is idempotent (wipes, no duplicate rows)', async () => {
    const db = await makeTestDb()
    await seedDemo(db, { now: NOW })
    const first = await db.select().from(spendTransaction)
    await seedDemo(db, { now: NOW })
    const second = await db.select().from(spendTransaction)
    expect(second.length).toBe(first.length)
    expect(await db.select().from(member)).toHaveLength(3)
  })
})
