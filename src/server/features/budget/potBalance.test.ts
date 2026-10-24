import { describe, it, expect } from 'vitest'
import { expectedPotBalances, type PotBalanceBillInput, type PotBalancePriceInput } from './potBalance'
import { periodConfig } from '../../../shared/period'

const PAYDAY_1ST = periodConfig(1)

const bill = (over: Partial<PotBalanceBillInput> & Pick<PotBalanceBillInput, 'id'>): PotBalanceBillInput => ({
  name: over.id,
  potId: 'pot',
  funding: 'pot_manual',
  recurrence: 'monthly',
  dueAnchor: null,
  amount: 0,
  active: true,
  ...over,
})

const balanceOn = (on: string, bills: PotBalanceBillInput[], priceHistory: PotBalancePriceInput[] = [], period = PAYDAY_1ST) =>
  expectedPotBalances({ potIds: ['pot'], bills, priceHistory, on, period })[0]!

describe('expectedPotBalances', () => {
  it('sums each bill by how many paydays of its cycle have passed', () => {
    const out = balanceOn('2026-10-23', [
      bill({ id: 'insurance', recurrence: 'yearly', dueAnchor: '2026-12-15', amount: 12000 }),
      bill({ id: 'water', recurrence: 'quarterly', dueAnchor: '2026-11-10', amount: 3000 }),
      bill({ id: 'phone', recurrence: 'monthly', dueAnchor: '2026-10-20', amount: 5000 }),
    ])
    expect(out.lines.map((l) => [l.expenseId, l.accrued])).toEqual([
      ['insurance', 10000], // 10 of 12 paydays since 15 Dec
      ['water', 2000], // 2 of 3 since 10 Aug
      ['phone', 0], // paid on the 20th, next payday is 1 Nov
    ])
    expect(out.total).toBe(12000)
    expect(out.lines[0]).toMatchObject({ lastDue: '2025-12-15', nextDue: '2026-12-15' })
  })

  it('is full the day before a yearly bill and empty on the day and after', () => {
    const bills = [bill({ id: 'insurance', recurrence: 'yearly', dueAnchor: '2026-12-15', amount: 12000 })]
    expect(balanceOn('2026-12-14', bills).total).toBe(12000)
    expect(balanceOn('2026-12-15', bills).total).toBe(0)
    expect(balanceOn('2026-12-16', bills).total).toBe(0)
  })

  it('uses the price in force on the day', () => {
    const bills = [bill({ id: 'insurance', recurrence: 'yearly', dueAnchor: '2026-12-15', amount: 15000 })]
    const history = [
      { expenseId: 'insurance', effectiveDate: '2025-01-01', amount: 12000, createdAt: new Date(1) },
      { expenseId: 'insurance', effectiveDate: '2026-11-01', amount: 15000, createdAt: new Date(2) },
    ]
    expect(balanceOn('2026-10-23', bills, history).lines[0]).toMatchObject({ amount: 12000, accrued: 10000 })
    expect(balanceOn('2026-11-05', bills, history).lines[0]).toMatchObject({ amount: 15000, accrued: 13750 })
    // Before any history, the starting price stands.
    expect(balanceOn('2024-06-01', bills, history).lines[0]!.amount).toBe(12000)
  })

  it('lists a bill with no due date but counts nothing for it', () => {
    const out = balanceOn('2026-10-23', [bill({ id: 'gym', amount: 4000 })])
    expect(out.lines).toEqual([
      { expenseId: 'gym', name: 'gym', recurrence: 'monthly', amount: 4000, lastDue: null, nextDue: null, accrued: 0 },
    ])
    expect(out.total).toBe(0)
  })

  it('counts auto-paid bills but not main-account, inactive or other pots’ bills', () => {
    const out = balanceOn('2026-10-23', [
      bill({ id: 'auto', funding: 'pot_auto', recurrence: 'quarterly', dueAnchor: '2026-11-10', amount: 3000 }),
      bill({ id: 'main', funding: 'main', potId: null, dueAnchor: '2026-11-10', amount: 3000 }),
      bill({ id: 'paused', active: false, dueAnchor: '2026-11-10', amount: 3000 }),
      bill({ id: 'elsewhere', potId: 'other', dueAnchor: '2026-11-10', amount: 3000 }),
    ])
    expect(out.lines.map((l) => l.expenseId)).toEqual(['auto'])
    expect(out.total).toBe(2000)
  })

  it('steps by the household’s own period on a weekly cycle', () => {
    const weekly = periodConfig({ budgetPeriodFrequency: 'weekly', budgetPeriodAnchor: '2026-10-02' })
    const bills = [bill({ id: 'phone', dueAnchor: '2026-10-20', amount: 4000 })]
    // Fridays after the 20th: 23 Oct … 20 Nov is five; two have passed by the 30th.
    expect(balanceOn('2026-10-30', bills, [], weekly).total).toBe(1600)
  })

  it('keeps a month-end due date on the month end', () => {
    const bills = [bill({ id: 'rent', dueAnchor: '2026-01-31', amount: 3100 })]
    expect(balanceOn('2026-02-28', bills).lines[0]).toMatchObject({ lastDue: '2026-02-28', nextDue: '2026-03-31', accrued: 0 })
    expect(balanceOn('2026-03-05', bills).total).toBe(3100)
  })
})
