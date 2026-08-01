import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import {
  household,
  user,
  membership,
  invitation,
  member,
  category,
  pot,
  expense,
  expenseShare,
  billPrice,
  standingOrderAck,
  setAside,
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
  auditLog,
  emailToken,
  instanceSettings,
  rateLimit,
  session,
} from './schema'

/** Every table, in FK-dependency (insert-safe) order — parents first. Reverse
 *  the list for deletes. Single source of truth for export / import / reset. */
export const ALL_TABLES: ReadonlyArray<readonly [string, PgTable]> = [
  ['household', household],
  ['user', user],
  ['membership', membership],
  ['invitation', invitation],
  ['member', member],
  ['category', category],
  ['pot', pot],
  ['expense', expense],
  ['expenseShare', expenseShare],
  ['billPrice', billPrice],
  ['standingOrderAck', standingOrderAck],
  ['setAside', setAside],
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

/** Tables deliberately kept OUT of the snapshot, each with the reason. Exists so
 *  a deliberate exclusion is distinguishable from a forgotten one: tables.test.ts
 *  asserts ALL_TABLES ∪ SNAPSHOT_EXCLUDED covers the whole schema, so a new table
 *  fails the suite until someone classifies it. Without that, a missed table
 *  defaults to silent data loss on restore — applySnapshot deletes every table it
 *  knows about and cascades into ones it doesn't, then re-inserts only its own
 *  (issue #99: bill_price vanished on every restore for exactly this reason). */
export const SNAPSHOT_EXCLUDED: ReadonlyArray<readonly [string, PgTable, string]> = [
  ['session', session, 'ephemeral: live logins, restoring them would resurrect revoked sessions'],
  ['rateLimit', rateLimit, 'ephemeral: instance-level throttle counters, meaningless once restored'],
  ['emailToken', emailToken, 'ephemeral: single-use short-lived tokens, restoring them un-consumes them'],
  [
    'instanceSettings',
    instanceSettings,
    'instance-scoped, and a security problem to restore: a stale auth_required would reopen a locked instance (#63)',
  ],
  ['auditLog', auditLog, 'operational metadata: an append-only record of what happened on THIS instance'],
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
  'movedAmount',
  'netPay',
  'newSalary',
  'bonus',
  'value',
])

/** (table, column) pairs holding money in minor units, derived from the schema:
 *  every integer column across ALL_TABLES whose property name is a money name. */
export const MONEY_COLUMNS: ReadonlyArray<readonly [PgTable, string]> = ALL_TABLES.flatMap(
  ([, table]) =>
    Object.entries(getTableColumns(table))
      .filter(([key, col]) => col.dataType === 'number' && MONEY_FIELD_NAMES.has(key))
      .map(([key]) => [table, key] as const),
)
