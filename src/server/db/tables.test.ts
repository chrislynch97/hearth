import { describe, it, expect } from 'vitest'
import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from './schema'
import { ALL_TABLES, MONEY_COLUMNS, SNAPSHOT_EXCLUDED } from './tables'

/** Reverse-lookup a table's registry name for readable assertions. */
function nameOf(table: unknown): string {
  return ALL_TABLES.find(([, t]) => t === table)?.[0] ?? '?'
}

/** Every table the schema barrel exports, discovered at runtime rather than from
 *  a second hand-written list — a list here would inherit the very problem this
 *  suite exists to catch. */
const SCHEMA_TABLES = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as PgTable[]

describe('snapshot table coverage', () => {
  it('classifies every table in the schema as included or excluded', () => {
    const classified = [...ALL_TABLES, ...SNAPSHOT_EXCLUDED].map(([, table]) => getTableName(table))
    // A new pgTable fails here until it is added to ALL_TABLES (restored with the
    // household's data) or to SNAPSHOT_EXCLUDED with a reason. Defaulting to
    // neither is what made #99 lose bill_price on every restore.
    expect(classified.sort()).toEqual(SCHEMA_TABLES.map(getTableName).sort())
  })

  it('classifies each table exactly once', () => {
    const names = [...ALL_TABLES, ...SNAPSHOT_EXCLUDED].map(([name]) => name)
    expect(names.sort()).toEqual([...new Set(names)].sort())
  })

  it('gives every exclusion a reason', () => {
    for (const [name, , reason] of SNAPSHOT_EXCLUDED) {
      expect(reason, `${name} needs a reason`).toBeTruthy()
    }
  })
})

describe('MONEY_COLUMNS (derived from schema)', () => {
  const pairs = MONEY_COLUMNS.map(([table, col]) => `${nameOf(table)}.${col}`).sort()

  it('detects every money column across the schema', () => {
    expect(pairs).toEqual(
      [
        'accountBalance.value',
        'billPrice.amount',
        'expense.amount',
        'expenseShare.amount',
        'incomeSource.amount',
        'payslip.netPay',
        'payslipLine.amount',
        'raise.bonus',
        'raise.newSalary',
        'reconciliationBatch.movedAmount',
        'reconciliationBatch.totalAmount',
        'setAside.amount',
        'spendTransaction.amount',
        'standingOrderAck.amount',
      ].sort(),
    )
  })

  it('excludes non-money integer columns (timestamps, counts, weights, order)', () => {
    const cols = MONEY_COLUMNS.map(([, col]) => col)
    for (const nonMoney of [
      'createdAt',
      'updatedAt',
      'archivedAt',
      'sortOrder',
      'transactionCount',
      'jointContributionWeight',
      'budgetPeriodStartDay',
      'currencyDecimalPlaces',
      'reconciled',
    ]) {
      expect(cols).not.toContain(nonMoney)
    }
  })
})
