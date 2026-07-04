/** Pure income logic (spec §6.2–6.3). `monthlyIncome` is the single figure all
 *  budgeting consumes. Amounts are integer minor units; dates are `YYYY-MM-DD`
 *  and compare lexicographically. Inputs are normalised summaries so this layer
 *  never touches the DB. */
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { subtractMonths } from '../../shared/dates'

export type IncomeBasis = 'regular_net' | 'latest_payslip' | 'rolling_12m'

export interface PayslipSummary {
  payDate: string
  effectiveNet: number
  grossPay: number
  /** Net with variable (bonus/overtime) earnings proportionally removed. */
  regularNet: number
  /** True when the payslip includes any variable (bonus/overtime) earning. */
  hasVariablePay: boolean
}

export interface IncomeSourceSummary {
  amount: number
  basis: 'net' | 'gross'
  recurrence: Recurrence
  active: boolean
}

/** Newest-first by pay date. */
function sortedDesc(payslips: PayslipSummary[]): PayslipSummary[] {
  return [...payslips].sort((a, b) => b.payDate.localeCompare(a.payDate))
}

/** Σ effective net for every payslip on or before `payDate`. */
export function runningTotalNet(payslips: PayslipSummary[], payDate: string): number {
  return payslips
    .filter((p) => p.payDate <= payDate)
    .reduce((acc, p) => acc + p.effectiveNet, 0)
}

/** Σ effective net over the trailing 12 months: (asOf−12mo) < payDate <= asOf. */
export function rolling12mNet(payslips: PayslipSummary[], asOf: string): number {
  const from = subtractMonths(asOf, 12)
  return payslips
    .filter((p) => p.payDate > from && p.payDate <= asOf)
    .reduce((acc, p) => acc + p.effectiveNet, 0)
}

/** Σ gross pay over the same trailing-12-month window as {@link rolling12mNet}. */
export function rolling12mIncome(payslips: PayslipSummary[], asOf: string): number {
  const from = subtractMonths(asOf, 12)
  return payslips
    .filter((p) => p.payDate > from && p.payDate <= asOf)
    .reduce((acc, p) => acc + p.grossPay, 0)
}

/** Σ monthly-equivalent of active *net* income sources (gross sources are shown
 *  in the UI but not counted as spendable income), rounded once. */
export function netIncomeSourceMonthly(sources: IncomeSourceSummary[]): number {
  const sum = sources
    .filter((s) => s.active && s.basis === 'net')
    .reduce((acc, s) => acc + normaliseToMonthly(s.amount, s.recurrence), 0)
  return roundMinor(sum)
}

/** The salaried monthly figure for one owner under the chosen basis (spec §6.3).
 *  `regular_net` (default) prefers the most recent *bonus-free* payslip and uses
 *  its actual net — the truest "normal month". Only when no clean payslip exists
 *  does it fall back to the latest payslip's `regularNet` (a proportional
 *  estimate, since a bonus shifts every threshold-based deduction). */
export function salaryMonthly(payslips: PayslipSummary[], basis: IncomeBasis, asOf: string): number {
  const sorted = sortedDesc(payslips)
  const latest = sorted[0]
  switch (basis) {
    case 'latest_payslip':
      return latest ? latest.effectiveNet : 0
    case 'rolling_12m':
      return roundMinor(rolling12mNet(payslips, asOf) / 12)
    case 'regular_net': {
      const clean = sorted.find((p) => !p.hasVariablePay)
      if (clean) return clean.effectiveNet
      return latest ? latest.regularNet : 0
    }
  }
}

/** `monthlyIncome(owner)` — the canonical spendable monthly income: salaried
 *  figure (per basis) plus active net income sources. */
export function monthlyIncome(input: {
  payslips: PayslipSummary[]
  sources: IncomeSourceSummary[]
  basis: IncomeBasis
  asOf: string
}): number {
  return salaryMonthly(input.payslips, input.basis, input.asOf) + netIncomeSourceMonthly(input.sources)
}
