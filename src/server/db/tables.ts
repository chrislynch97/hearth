import { getTableColumns } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import {
  household,
  member,
  category,
  pot,
  expense,
  expenseShare,
  reconciliationBatch,
  importBatch,
  spendTransaction,
  incomeSource,
  payslipComponentType,
  payslip,
  payslipLine,
  raise,
  account,
  accountBalance,
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
  ['importBatch', importBatch],
  ['spendTransaction', spendTransaction],
  ['incomeSource', incomeSource],
  ['payslipComponentType', payslipComponentType],
  ['payslip', payslip],
  ['payslipLine', payslipLine],
  ['raise', raise],
  ['account', account],
  ['accountBalance', accountBalance],
] as const

/** JS property names that hold money in minor units. Integer columns with one
 *  of these names are treated as money and rescaled when the currency's
 *  decimal-places change. Kept as a small convention set — NOT a per-table
 *  list — so a new table with a conventionally-named money column is picked up
 *  automatically (spec §5.7: "columns derived from schema metadata"). Deliberately
 *  excludes non-money integers like sortOrder, *At timestamps, counts and weights. */
export const MONEY_FIELD_NAMES: ReadonlySet<string> = new Set([
  'amount',
  'totalAmount',
  'netPay',
  'newSalary',
  'bonus',
  'value',
])

/** (table, column) pairs holding money in minor units, derived from the schema:
 *  every integer column across ALL_TABLES whose property name is a money name. */
export const MONEY_COLUMNS: ReadonlyArray<readonly [SQLiteTable, string]> = ALL_TABLES.flatMap(
  ([, table]) =>
    Object.entries(getTableColumns(table))
      .filter(([key, col]) => col.dataType === 'number' && MONEY_FIELD_NAMES.has(key))
      .map(([key]) => [table, key] as const),
)
