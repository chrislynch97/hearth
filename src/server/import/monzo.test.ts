import { describe, it, expect } from 'vitest'
import { mapMonzoRows } from './monzo'

const opts = { currencyCode: 'GBP', decimalPlaces: 2 }

function row(over: Record<string, string>): Record<string, string> {
  return {
    'Transaction ID': 'tx_1',
    Date: '04/07/2026',
    Type: 'Card payment',
    Name: 'Tesco',
    Amount: '-12.50',
    Currency: 'GBP',
    'Local currency': 'GBP',
    Category: 'Groceries',
    ...over,
  }
}

describe('mapMonzoRows', () => {
  it('normalises a spend: negates sign and converts to minor units', () => {
    const [r] = mapMonzoRows([row({})], opts)
    expect(r!.amount).toBe(1250) // Monzo -12.50 → Hearth +1250 (a spend)
    expect(r!.date).toBe('2026-07-04')
    expect(r!.description).toBe('Tesco')
    expect(r!.status).toBe('new')
  })

  it('treats money-in as a refund (negative Hearth amount)', () => {
    const [r] = mapMonzoRows([row({ Amount: '4.00', Name: 'Refund' })], opts)
    expect(r!.amount).toBe(-400)
  })

  it('flags foreign-currency rows', () => {
    const [r] = mapMonzoRows([row({ Currency: 'EUR', 'Local currency': 'EUR' })], opts)
    expect(r!.foreign).toBe(true)
    expect(r!.status).toBe('foreign')
  })

  it('excludes pot transfers as internal moves', () => {
    const [r] = mapMonzoRows([row({ Type: 'Pot transfer', Name: 'Savings' })], opts)
    expect(r!.internal).toBe(true)
    expect(r!.status).toBe('excluded')
  })

  it('marks already-imported refs as duplicates', () => {
    const [r] = mapMonzoRows([row({})], { ...opts, existingRefs: new Set(['tx_1']) })
    expect(r!.status).toBe('duplicate')
  })

  it('surfaces malformed rows as errors, never dropping them', () => {
    const missingId = mapMonzoRows([row({ 'Transaction ID': '' })], opts)[0]!
    expect(missingId.status).toBe('error')
    expect(missingId.error).toMatch(/Transaction ID/)

    const badAmount = mapMonzoRows([row({ Amount: 'NaN!' })], opts)[0]!
    expect(badAmount.status).toBe('error')

    const badDate = mapMonzoRows([row({ Date: '2026/31/31' })], opts)[0]!
    expect(badDate.status).toBe('error')
  })

  it('falls back to Description then a placeholder when Name is blank', () => {
    const [r] = mapMonzoRows([row({ Name: '', Description: 'Acme Ltd' })], opts)
    expect(r!.description).toBe('Acme Ltd')
  })

  it('duplicate takes precedence over an internal/foreign flag', () => {
    const [r] = mapMonzoRows([row({ Type: 'Pot transfer' })], { ...opts, existingRefs: new Set(['tx_1']) })
    expect(r!.status).toBe('duplicate')
  })
})
