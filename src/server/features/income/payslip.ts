/** Pure payslip arithmetic. All amounts are integer minor units. See spec §4
 *  (PayslipLine computed fields). */
import { roundMinor } from '../../../shared/recurrence'

export type ComponentKind = 'earning' | 'deduction' | 'employer_info'

export interface PayslipLineInput {
  kind: ComponentKind
  amount: number
  /** Bonus/overtime earning — excluded from the regular (salaried) figure.
   *  Only meaningful on earnings; ignored on deductions/employer_info. */
  isVariable?: boolean
}

export interface PayslipTotals {
  grossPay: number
  totalDeductions: number
  computedNet: number
  /** The canonical net used everywhere: the recorded net_pay override if given, else computedNet. */
  effectiveNet: number
  /** Sum of variable (bonus/overtime) earnings. */
  variableEarnings: number
  /** Net with variable earnings proportionally removed — the "normal month" take-home. */
  regularNet: number
}

/** Compute a payslip's gross/deductions/net from its line items.
 *  `employer_info` lines are informational and excluded from every total.
 *  `regularNet` scales the net down by the share of gross that isn't variable,
 *  so a one-off bonus doesn't inflate the salaried figure. */
export function computePayslipTotals(
  lines: PayslipLineInput[],
  netPayOverride?: number | null,
): PayslipTotals {
  let grossPay = 0
  let totalDeductions = 0
  let variableEarnings = 0
  for (const line of lines) {
    if (line.kind === 'earning') {
      grossPay += line.amount
      if (line.isVariable) variableEarnings += line.amount
    } else if (line.kind === 'deduction') {
      totalDeductions += line.amount
    }
    // employer_info: ignored
  }
  const computedNet = grossPay - totalDeductions
  const effectiveNet = netPayOverride ?? computedNet
  const regularNet =
    grossPay > 0 ? roundMinor(((grossPay - variableEarnings) * effectiveNet) / grossPay) : effectiveNet
  return { grossPay, totalDeductions, computedNet, effectiveNet, variableEarnings, regularNet }
}
