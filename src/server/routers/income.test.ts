import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

type Caller = ReturnType<typeof appRouter.createCaller>

/** Give a person one clean "regular" payslip (basic − tax) worth `net` minor units. */
async function addRegularPayslip(caller: Caller, ownerId: string, payDate: string, gross: number, tax: number) {
  const basic = await caller.payslipComponents.create({ ownerId, name: 'Basic Pay', kind: 'earning' })
  const taxC = await caller.payslipComponents.create({ ownerId, name: 'Income Tax', kind: 'deduction' })
  return caller.payslips.create({
    ownerId,
    payDate,
    lines: [
      { componentId: basic.id, amount: gross },
      { componentId: taxC.id, amount: tax },
    ],
  })
}

describe('income router', () => {
  it('overview sums salary and active net sources, excluding gross sources', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    await addRegularPayslip(caller, alice.id, '2026-06-30', 300000, 60000) // net 240000
    await caller.incomeSources.create({ ownerId: alice.id, name: 'Rent', amount: 20000, recurrence: 'monthly' }) // +20000 net
    await caller.incomeSources.create({ ownerId: alice.id, name: 'Gross thing', amount: 99999, recurrence: 'monthly', basis: 'gross' }) // excluded

    const overview = await caller.income.overview()
    const aliceRow = overview.perMember.find((m) => m.memberId === alice.id)!
    expect(aliceRow.salaryMonthly).toBe(240000)
    expect(aliceRow.incomeSourceMonthly).toBe(20000)
    expect(aliceRow.monthlyIncome).toBe(260000)
    expect(overview.householdMonthlyIncome).toBe(260000) // joint contributes 0
  })

  it('funding plan remainder reflects payslip-derived monthly income', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })
    const alice = await caller.members.addPerson({ displayName: 'Alice' })

    await addRegularPayslip(caller, alice.id, '2026-06-30', 300000, 60000) // net 240000

    const pot = await caller.pots.create({ name: 'Alice Bills', ownerId: alice.id })
    await caller.expenses.create({
      name: 'Broadband', recurrence: 'monthly', amount: 40000, funding: 'pot_manual', potId: pot.id,
    })

    const plan = await caller.plan.funding()
    const aliceRow = plan.perPerson.find((p) => p.memberId === alice.id)!
    expect(aliceRow.monthlyIncome).toBe(240000)
    expect(aliceRow.setAside).toBe(40000)
    expect(aliceRow.remainder).toBe(200000)
  })
})
