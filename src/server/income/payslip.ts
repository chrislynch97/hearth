/** Pure payslip arithmetic. All amounts are integer minor units, so sums are
 *  exact and need no rounding. See spec §4 (PayslipLine computed fields). */

export type ComponentKind = 'earning' | 'deduction' | 'employer_info'

export interface PayslipLineInput {
  kind: ComponentKind
  amount: number
}

export interface PayslipTotals {
  grossPay: number
  totalDeductions: number
  computedNet: number
  /** The canonical net used everywhere: the recorded net_pay override if given, else computedNet. */
  effectiveNet: number
}

/** Compute a payslip's gross/deductions/net from its line items.
 *  `employer_info` lines are informational and excluded from every total. */
export function computePayslipTotals(
  lines: PayslipLineInput[],
  netPayOverride?: number | null,
): PayslipTotals {
  let grossPay = 0
  let totalDeductions = 0
  for (const line of lines) {
    if (line.kind === 'earning') grossPay += line.amount
    else if (line.kind === 'deduction') totalDeductions += line.amount
    // employer_info: ignored
  }
  const computedNet = grossPay - totalDeductions
  const effectiveNet = netPayOverride ?? computedNet
  return { grossPay, totalDeductions, computedNet, effectiveNet }
}
