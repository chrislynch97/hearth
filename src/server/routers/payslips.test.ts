import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

/** Set up a person with a standard set of components. */
async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const caller = appRouter.createCaller({ db, householdId: 'household' })
  const alice = await caller.members.addPerson({ displayName: 'Alice' })
  const basic = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Basic Pay', kind: 'earning' })
  const bonus = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Bonus', kind: 'earning', isVariable: true })
  const tax = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Income Tax', kind: 'deduction' })
  const pension = await caller.payslipComponents.create({ ownerId: alice.id, name: 'Employer Pension', kind: 'employer_info' })
  return { caller, alice, basic, bonus, tax, pension }
}

describe('payslips router', () => {
  it('computes gross/deductions/net, excluding employer_info', async () => {
    const { caller, alice, basic, tax, pension } = await setup()
    const slip = await caller.payslips.create({
      ownerId: alice.id,
      payDate: '2026-06-30',
      lines: [
        { componentId: basic.id, amount: 300000 },
        { componentId: tax.id, amount: 60000 },
        { componentId: pension.id, amount: 15000 }, // employer_info → ignored
      ],
    })
    expect(slip.totals.grossPay).toBe(300000)
    expect(slip.totals.totalDeductions).toBe(60000)
    expect(slip.totals.computedNet).toBe(240000)
    expect(slip.totals.effectiveNet).toBe(240000)
    expect(slip.hasVariablePay).toBe(false)
  })

  it('flags variable pay and honours a recorded net override', async () => {
    const { caller, alice, basic, bonus, tax } = await setup()
    const slip = await caller.payslips.create({
      ownerId: alice.id,
      payDate: '2026-07-31',
      netPay: 389900,
      lines: [
        { componentId: basic.id, amount: 300000 },
        { componentId: bonus.id, amount: 150000 },
        { componentId: tax.id, amount: 60000 },
      ],
    })
    expect(slip.totals.computedNet).toBe(390000)
    expect(slip.totals.effectiveNet).toBe(389900) // override wins
    expect(slip.hasVariablePay).toBe(true)
  })

  it('rejects a component belonging to another member', async () => {
    const { caller, alice } = await setup()
    const bob = await caller.members.addPerson({ displayName: 'Bob' })
    const bobBasic = await caller.payslipComponents.create({ ownerId: bob.id, name: 'Basic', kind: 'earning' })
    await expect(
      caller.payslips.create({ ownerId: alice.id, payDate: '2026-06-30', lines: [{ componentId: bobBasic.id, amount: 1 }] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects duplicate components in one payslip', async () => {
    const { caller, alice, basic } = await setup()
    await expect(
      caller.payslips.create({
        ownerId: alice.id,
        payDate: '2026-06-30',
        lines: [
          { componentId: basic.id, amount: 1 },
          { componentId: basic.id, amount: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('update replaces lines; list is newest-first; remove deletes with its lines', async () => {
    const { caller, alice, basic, tax } = await setup()
    const may = await caller.payslips.create({ ownerId: alice.id, payDate: '2026-05-31', lines: [{ componentId: basic.id, amount: 100000 }] })
    await caller.payslips.create({ ownerId: alice.id, payDate: '2026-06-30', lines: [{ componentId: basic.id, amount: 110000 }] })

    const list = await caller.payslips.list({ ownerId: alice.id })
    expect(list.map((p) => p.payDate)).toEqual(['2026-06-30', '2026-05-31']) // desc

    const updated = await caller.payslips.update({
      id: may.id,
      lines: [
        { componentId: basic.id, amount: 100000 },
        { componentId: tax.id, amount: 20000 },
      ],
    })
    expect(updated.totals.computedNet).toBe(80000)

    await caller.payslips.remove({ id: may.id })
    const after = await caller.payslips.list({ ownerId: alice.id })
    expect(after.map((p) => p.payDate)).toEqual(['2026-06-30'])
  })
})
