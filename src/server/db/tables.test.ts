import { describe, it, expect } from 'vitest'
import { ALL_TABLES, MONEY_COLUMNS } from './tables'

/** Reverse-lookup a table's registry name for readable assertions. */
function nameOf(table: unknown): string {
  return ALL_TABLES.find(([, t]) => t === table)?.[0] ?? '?'
}

describe('MONEY_COLUMNS (derived from schema)', () => {
  const pairs = MONEY_COLUMNS.map(([table, col]) => `${nameOf(table)}.${col}`).sort()

  it('detects every money column across the schema', () => {
    expect(pairs).toEqual(
      [
        'accountBalance.value',
        'expense.amount',
        'expenseShare.amount',
        'incomeSource.amount',
        'payslip.netPay',
        'payslipLine.amount',
        'raise.bonus',
        'raise.newSalary',
        'reconciliationBatch.totalAmount',
        'setAside.amount',
        'spendTransaction.amount',
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
