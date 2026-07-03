import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import {
  household,
  member,
  category,
  pot,
  expense,
  expenseShare,
  reconciliationBatch,
  spendTransaction,
  incomeSource,
  payslipComponentType,
  payslip,
  payslipLine,
  raise,
} from './schema'

/** Every table, in FK-dependency (insert-safe) order — parents first. Reverse
 *  the list for deletes. Single source of truth for export / import / reset. */
export const ALL_TABLES: ReadonlyArray<readonly [string, SQLiteTable]> = [
  ['household', household],
  ['member', member],
  ['category', category],
  ['pot', pot],
  ['expense', expense],
  ['expenseShare', expenseShare],
  ['reconciliationBatch', reconciliationBatch],
  ['spendTransaction', spendTransaction],
  ['incomeSource', incomeSource],
  ['payslipComponentType', payslipComponentType],
  ['payslip', payslip],
  ['payslipLine', payslipLine],
  ['raise', raise],
] as const

/** (table, column) pairs holding money in minor units — rescaled when the
 *  household's currency decimal-places change. */
export const MONEY_COLUMNS: ReadonlyArray<readonly [SQLiteTable, string]> = [
  [expenseShare, 'amount'],
  [spendTransaction, 'amount'],
  [reconciliationBatch, 'totalAmount'],
  [incomeSource, 'amount'],
  [payslip, 'netPay'],
  [payslipLine, 'amount'],
  [raise, 'newSalary'],
  [raise, 'bonus'],
] as const
