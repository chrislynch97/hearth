import { describe, it, expect } from 'vitest'
import {
  monthlyIncome,
  netIncomeSourceMonthly,
  rolling12mIncome,
  rolling12mNet,
  runningTotalNet,
  salaryMonthly,
  type PayslipSummary,
} from './income'

function slip(payDate: string, effectiveNet: number, grossPay: number, regularNet = effectiveNet): PayslipSummary {
  return { payDate, effectiveNet, grossPay, regularNet, hasVariablePay: regularNet !== effectiveNet }
}

describe('runningTotalNet', () => {
  it('sums effective net for all payslips up to and including a date', () => {
    const slips = [slip('2026-01-31', 100000, 130000), slip('2026-02-28', 110000, 140000), slip('2026-03-31', 120000, 150000)]
    expect(runningTotalNet(slips, '2026-02-28')).toBe(210000)
    expect(runningTotalNet(slips, '2026-03-31')).toBe(330000)
  })
})

describe('rolling 12-month windows', () => {
  const slips = [
    slip('2025-06-30', 90000, 120000), // exactly 12mo before asOf → EXCLUDED (strict >)
    slip('2025-07-31', 100000, 130000),
    slip('2026-06-30', 120000, 150000), // asOf boundary → included
  ]
  it('rolling12mNet excludes the far boundary, includes the near one', () => {
    expect(rolling12mNet(slips, '2026-06-30')).toBe(220000) // 100000 + 120000
  })
  it('rolling12mIncome uses gross over the same window', () => {
    expect(rolling12mIncome(slips, '2026-06-30')).toBe(280000) // 130000 + 150000
  })
})

describe('netIncomeSourceMonthly', () => {
  it('sums monthly-equivalents of active net sources, excluding gross and inactive', () => {
    const total = netIncomeSourceMonthly([
      { amount: 20000, basis: 'net', recurrence: 'monthly', active: true }, // £200/mo
      { amount: 120000, basis: 'net', recurrence: 'yearly', active: true }, // £1200/yr → £100/mo
      { amount: 50000, basis: 'gross', recurrence: 'monthly', active: true }, // gross → excluded
      { amount: 99999, basis: 'net', recurrence: 'monthly', active: false }, // inactive → excluded
    ])
    expect(total).toBe(30000)
  })
})

describe('salaryMonthly', () => {
  const asOf = '2026-07-03'
  it('regular_net prefers the most recent bonus-free payslip and uses its actual net', () => {
    // May is a clean month (£3241.28); June has a bonus. Use May's real net, not
    // a proportional estimate off June (deductions are non-linear in gross).
    const may = slip('2026-05-29', 324128, 508333)
    const june = slip('2026-06-30', 408805, 708333, 293378) // bonus month
    expect(salaryMonthly([may, june], 'regular_net', asOf)).toBe(324128)
  })
  it('regular_net falls back to the latest payslip\'s regularNet when no clean month exists', () => {
    const slips = [slip('2026-06-30', 400000, 700000, 285714)] // only a bonus month
    expect(salaryMonthly(slips, 'regular_net', asOf)).toBe(285714)
  })
  it('latest_payslip uses the most recent payslip net, bonus included', () => {
    const slips = [slip('2026-05-31', 300000, 380000), slip('2026-06-30', 450000, 560000, 300000)]
    expect(salaryMonthly(slips, 'latest_payslip', asOf)).toBe(450000)
  })
  it('rolling_12m averages net over the trailing year', () => {
    const slips = [slip('2026-01-31', 120000, 150000), slip('2026-02-28', 120000, 150000)]
    expect(salaryMonthly(slips, 'rolling_12m', asOf)).toBe(20000) // 240000 / 12
  })
  it('returns 0 when there is no payslip data', () => {
    expect(salaryMonthly([], 'regular_net', asOf)).toBe(0)
    expect(salaryMonthly([], 'latest_payslip', asOf)).toBe(0)
    expect(salaryMonthly([], 'rolling_12m', asOf)).toBe(0)
  })
  it('ignores future-dated payslips across every basis (#11)', () => {
    // A 2027 typo must not become canonical income while the real latest is May.
    const may = slip('2026-05-29', 300000, 380000)
    const future = slip('2027-06-30', 999999, 1200000)
    expect(salaryMonthly([may, future], 'latest_payslip', asOf)).toBe(300000)
    expect(salaryMonthly([may, future], 'regular_net', asOf)).toBe(300000)
    // With only a future payslip there is no eligible data → 0.
    expect(salaryMonthly([future], 'latest_payslip', asOf)).toBe(0)
    expect(salaryMonthly([future], 'regular_net', asOf)).toBe(0)
  })
})

describe('monthlyIncome', () => {
  const asOf = '2026-07-03'
  it('adds regular salary and active net income sources', () => {
    const slips = [slip('2026-06-30', 300000, 380000)]
    const sources = [{ amount: 20000, basis: 'net' as const, recurrence: 'monthly' as const, active: true }]
    expect(monthlyIncome({ payslips: slips, sources, basis: 'regular_net', asOf })).toBe(320000)
  })
  it('works from income sources alone when there are no payslips', () => {
    const sources = [{ amount: 150000, basis: 'net' as const, recurrence: 'monthly' as const, active: true }]
    expect(monthlyIncome({ payslips: [], sources, basis: 'regular_net', asOf })).toBe(150000)
  })
})
