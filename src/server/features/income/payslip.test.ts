import { describe, it, expect } from 'vitest'
import { computePayslipTotals } from './payslip'

describe('computePayslipTotals', () => {
  it('gross = Σ earnings, deductions = Σ deductions, net = gross − deductions', () => {
    const totals = computePayslipTotals([
      { kind: 'earning', amount: 300000 }, // £3000 basic
      { kind: 'earning', amount: 50000 }, // £500 overtime
      { kind: 'deduction', amount: 60000 }, // £600 tax
      { kind: 'deduction', amount: 20000 }, // £200 NI
    ])
    expect(totals.grossPay).toBe(350000)
    expect(totals.totalDeductions).toBe(80000)
    expect(totals.computedNet).toBe(270000)
    expect(totals.effectiveNet).toBe(270000)
  })

  it('employer_info lines never enter gross, deductions or net', () => {
    const totals = computePayslipTotals([
      { kind: 'earning', amount: 300000 },
      { kind: 'deduction', amount: 60000 },
      { kind: 'employer_info', amount: 15000 }, // e.g. employer pension contribution
    ])
    expect(totals.grossPay).toBe(300000)
    expect(totals.totalDeductions).toBe(60000)
    expect(totals.computedNet).toBe(240000)
  })

  it('effective_net uses the recorded net_pay override when present', () => {
    const totals = computePayslipTotals(
      [
        { kind: 'earning', amount: 300000 },
        { kind: 'deduction', amount: 60000 },
      ],
      239900, // actual net differs by a rounding/adjustment
    )
    expect(totals.computedNet).toBe(240000)
    expect(totals.effectiveNet).toBe(239900)
  })

  it('a null/undefined override falls back to computed net', () => {
    const lines = [{ kind: 'earning', amount: 100000 } as const]
    expect(computePayslipTotals(lines, null).effectiveNet).toBe(100000)
    expect(computePayslipTotals(lines, undefined).effectiveNet).toBe(100000)
  })

  it('handles an empty payslip', () => {
    const totals = computePayslipTotals([])
    expect(totals).toEqual({
      grossPay: 0,
      totalDeductions: 0,
      computedNet: 0,
      effectiveNet: 0,
      variableEarnings: 0,
      regularNet: 0,
    })
  })

  it('regularNet equals net when there is no variable pay', () => {
    const totals = computePayslipTotals([
      { kind: 'earning', amount: 300000 },
      { kind: 'deduction', amount: 60000 },
    ])
    expect(totals.variableEarnings).toBe(0)
    expect(totals.regularNet).toBe(240000)
  })

  it('regularNet removes a bonus proportionally (bonus does not inflate salary)', () => {
    // £5000 basic + £2000 bonus (variable) = £7000 gross; £3000 deductions → £4000 net.
    // Regular share of gross = 5000/7000; regularNet = 4000 × 5/7 = £2857.14 → 285714.
    const totals = computePayslipTotals([
      { kind: 'earning', amount: 500000 },
      { kind: 'earning', amount: 200000, isVariable: true },
      { kind: 'deduction', amount: 300000 },
    ])
    expect(totals.grossPay).toBe(700000)
    expect(totals.variableEarnings).toBe(200000)
    expect(totals.effectiveNet).toBe(400000)
    expect(totals.regularNet).toBe(285714)
  })

  it('ignores the variable flag on deductions', () => {
    const totals = computePayslipTotals([
      { kind: 'earning', amount: 300000 },
      { kind: 'deduction', amount: 60000, isVariable: true }, // nonsensical → ignored
    ])
    expect(totals.variableEarnings).toBe(0)
    expect(totals.regularNet).toBe(240000)
  })
})
