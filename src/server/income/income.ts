/** Pure income logic (spec §6.2–6.3). `monthlyIncome` is the single figure all
 *  budgeting consumes. Amounts are integer minor units; dates are `YYYY-MM-DD`
 *  and compare lexicographically. Inputs are normalised summaries so this layer
 *  never touches the DB. */
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { subtractMonths } from '../../shared/dates'
import { currentSalary, type RaiseInput } from './raises'

export type IncomeBasis = 'regular_net' | 'latest_payslip' | 'rolling_12m'

export interface PayslipSummary {
  payDate: string
  effectiveNet: number
  grossPay: number
  /** True when any `is_variable` line (bonus/overtime) has a non-zero amount. */
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

/** The most recent payslip with no variable pay (a clean "regular" month), or null. */
export function regularPayslip(payslips: PayslipSummary[]): PayslipSummary | null {
  return sortedDesc(payslips).find((p) => !p.hasVariablePay) ?? null
}

/** Σ net / Σ gross over the last 3 regular (non-variable) payslips; null if none
 *  or gross sums to 0 (guards a zero denominator). */
export function recentNetRatio(payslips: PayslipSummary[]): number | null {
  const regular = sortedDesc(payslips)
    .filter((p) => !p.hasVariablePay)
    .slice(0, 3)
  if (regular.length === 0) return null
  const gross = regular.reduce((acc, p) => acc + p.grossPay, 0)
  if (gross === 0) return null
  const net = regular.reduce((acc, p) => acc + p.effectiveNet, 0)
  return net / gross
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
 *  `regular_net` (default) falls back to (currentSalary/12) × recentNetRatio, then 0
 *  (leaving income sources to carry the total). */
export function salaryMonthly(
  payslips: PayslipSummary[],
  raises: RaiseInput[],
  basis: IncomeBasis,
  asOf: string,
): number {
  switch (basis) {
    case 'latest_payslip': {
      const [latest] = sortedDesc(payslips)
      return latest ? latest.effectiveNet : 0
    }
    case 'rolling_12m':
      return roundMinor(rolling12mNet(payslips, asOf) / 12)
    case 'regular_net': {
      const regular = regularPayslip(payslips)
      if (regular) return regular.effectiveNet
      const salary = currentSalary(raises, asOf)
      const ratio = recentNetRatio(payslips)
      if (salary !== null && ratio !== null) return roundMinor((salary / 12) * ratio)
      return 0
    }
  }
}

/** `monthlyIncome(owner)` — the canonical spendable monthly income: salaried
 *  figure (per basis) plus active net income sources. */
export function monthlyIncome(input: {
  payslips: PayslipSummary[]
  raises: RaiseInput[]
  sources: IncomeSourceSummary[]
  basis: IncomeBasis
  asOf: string
}): number {
  return (
    salaryMonthly(input.payslips, input.raises, input.basis, input.asOf) +
    netIncomeSourceMonthly(input.sources)
  )
}
