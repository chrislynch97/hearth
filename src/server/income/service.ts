/** DB-aware income aggregation. Loads payslips/raises/income-sources once and
 *  computes per-member monthly income via the pure logic in ./income. Shared by
 *  the income router and the funding plan so `monthlyIncome` has one definition. */
import { eq, isNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import {
  household,
  incomeSource,
  member,
  payslip,
  payslipComponentType,
  payslipLine,
  raise,
} from '../db/schema'
import { todayIso } from '../../shared/dates'
import type { Recurrence } from '../../shared/recurrence'
import { computePayslipTotals, type ComponentKind } from './payslip'
import {
  netIncomeSourceMonthly,
  salaryMonthly,
  type IncomeBasis,
  type IncomeSourceSummary,
  type PayslipSummary,
} from './income'
import type { RaiseInput } from './raises'

const HOUSEHOLD_ID = 'household'

export interface MemberIncome {
  memberId: string
  salaryMonthly: number
  incomeSourceMonthly: number
  monthlyIncome: number
}

export interface OwnedPayslipSummary extends PayslipSummary {
  ownerId: string
}

/** Load every payslip as a normalised summary (net/gross/variability resolved
 *  from its lines' components). Shared by income aggregation and the dashboard. */
export async function loadPayslipSummaries(db: DB): Promise<OwnedPayslipSummary[]> {
  const payslips = await db.select().from(payslip)
  const lines = await db.select().from(payslipLine)
  const components = await db.select().from(payslipComponentType)

  const componentById = new Map(components.map((c) => [c.id, c]))
  const linesByPayslip = new Map<string, typeof lines>()
  for (const l of lines) {
    const arr = linesByPayslip.get(l.payslipId) ?? []
    arr.push(l)
    linesByPayslip.set(l.payslipId, arr)
  }

  return payslips.map((p) => {
    const pls = linesByPayslip.get(p.id) ?? []
    const totals = computePayslipTotals(
      pls.map((l) => ({
        kind: (componentById.get(l.componentId)?.kind ?? 'employer_info') as ComponentKind,
        amount: l.amount,
      })),
      p.netPay,
    )
    const hasVariablePay = pls.some(
      (l) => componentById.get(l.componentId)?.isVariable === 1 && l.amount !== 0,
    )
    return { ownerId: p.ownerId, payDate: p.payDate, effectiveNet: totals.effectiveNet, grossPay: totals.grossPay, hasVariablePay }
  })
}

export async function computeIncomeByMember(
  db: DB,
  asOf: string = todayIso(),
): Promise<Map<string, MemberIncome>> {
  const [householdRow] = await db.select().from(household).where(eq(household.id, HOUSEHOLD_ID))
  const basis = (householdRow?.incomeBasisDefault ?? 'regular_net') as IncomeBasis

  const members = await db.select().from(member).where(isNull(member.archivedAt))
  const raises = await db.select().from(raise)
  const sources = await db.select().from(incomeSource).where(isNull(incomeSource.archivedAt))

  const payslipsByOwner = new Map<string, PayslipSummary[]>()
  for (const p of await loadPayslipSummaries(db)) {
    const arr = payslipsByOwner.get(p.ownerId) ?? []
    arr.push({ payDate: p.payDate, effectiveNet: p.effectiveNet, grossPay: p.grossPay, hasVariablePay: p.hasVariablePay })
    payslipsByOwner.set(p.ownerId, arr)
  }

  const raisesByOwner = new Map<string, RaiseInput[]>()
  for (const r of raises) {
    const arr = raisesByOwner.get(r.ownerId) ?? []
    arr.push({ id: r.id, effectiveDate: r.effectiveDate, newSalary: r.newSalary })
    raisesByOwner.set(r.ownerId, arr)
  }

  const sourcesByOwner = new Map<string, IncomeSourceSummary[]>()
  for (const s of sources) {
    const arr = sourcesByOwner.get(s.ownerId) ?? []
    arr.push({
      amount: s.amount,
      basis: s.basis as 'net' | 'gross',
      recurrence: s.recurrence as Recurrence,
      active: s.active === 1,
    })
    sourcesByOwner.set(s.ownerId, arr)
  }

  const result = new Map<string, MemberIncome>()
  for (const m of members) {
    const salary = salaryMonthly(payslipsByOwner.get(m.id) ?? [], raisesByOwner.get(m.id) ?? [], basis, asOf)
    const incomeSourceMonthly = netIncomeSourceMonthly(sourcesByOwner.get(m.id) ?? [])
    result.set(m.id, {
      memberId: m.id,
      salaryMonthly: salary,
      incomeSourceMonthly,
      monthlyIncome: salary + incomeSourceMonthly,
    })
  }
  return result
}
