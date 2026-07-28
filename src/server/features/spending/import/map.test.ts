import { describe, it, expect } from 'vitest'
import { mapRows } from './map'
import type { MapOptions } from './map'
import { getProfile } from './profiles'

const monzo = getProfile('monzo_csv')
const opts: MapOptions = { currencyCode: 'GBP', decimalPlaces: 2 }

/** Convenience: map with a profile and return just the rows. */
function map(rows: Array<Record<string, string>>, profile = monzo, o: MapOptions = opts) {
  return mapRows(rows, profile, o).rows
}

function monzoRow(over: Record<string, string>): Record<string, string> {
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

describe('mapRows (Monzo profile)', () => {
  it('normalises a spend: negates sign and converts to minor units', () => {
    const [r] = map([monzoRow({})])
    expect(r!.amount).toBe(1250) // Monzo -12.50 → Hearth +1250 (a spend)
    expect(r!.date).toBe('2026-07-04')
    expect(r!.description).toBe('Tesco')
    expect(r!.status).toBe('new')
  })

  it('treats money-in as a refund (negative Hearth amount)', () => {
    const [r] = map([monzoRow({ Amount: '4.00', Name: 'Refund' })])
    expect(r!.amount).toBe(-400)
  })

  it('flags foreign-currency rows', () => {
    const [r] = map([monzoRow({ Currency: 'EUR', 'Local currency': 'EUR' })])
    expect(r!.foreign).toBe(true)
    expect(r!.status).toBe('foreign')
  })

  it('excludes pot transfers as internal moves', () => {
    const [r] = map([monzoRow({ Type: 'Pot transfer', Name: 'Savings' })])
    expect(r!.internal).toBe(true)
    expect(r!.status).toBe('excluded')
  })

  it('marks already-imported refs as duplicates', () => {
    const [r] = map([monzoRow({})], monzo, { ...opts, existingRefs: new Set(['tx_1']) })
    expect(r!.status).toBe('duplicate')
  })

  it('surfaces malformed rows as errors, never dropping them', () => {
    const missingId = map([monzoRow({ 'Transaction ID': '' })])[0]!
    expect(missingId.status).toBe('error')
    expect(missingId.error).toMatch(/transaction id/i)

    const badAmount = map([monzoRow({ Amount: 'NaN!' })])[0]!
    expect(badAmount.status).toBe('error')

    const badDate = map([monzoRow({ Date: '2026/31/31' })])[0]!
    expect(badDate.status).toBe('error')
  })

  it('falls back to Description then a placeholder when Name is blank', () => {
    const [r] = map([monzoRow({ Name: '', Description: 'Acme Ltd' })])
    expect(r!.description).toBe('Acme Ltd')
  })

  it('duplicate takes precedence over an internal/foreign flag', () => {
    const [r] = map([monzoRow({ Type: 'Pot transfer' })], monzo, { ...opts, existingRefs: new Set(['tx_1']) })
    expect(r!.status).toBe('duplicate')
  })
})

describe('mapRows (profiles & generic behaviour)', () => {
  it('parses each profile’s date order into ISO', () => {
    const revolut = getProfile('revolut_csv') // YMD
    const [r] = mapRows(
      [{ 'Transaction ID': 'r1', 'Started Date': '2026-03-09 12:00:00', Amount: '-5.00', Description: 'Coffee' }],
      revolut,
      opts,
    ).rows
    expect(r!.date).toBe('2026-03-09')

    // The generic profile reads DD/MM/YYYY (03/09 → 3 September).
    const generic = getProfile('generic_csv')
    const [g] = mapRows([{ Date: '03/09/2026', Amount: '-5.00', Description: 'Coffee' }], generic, opts).rows
    expect(g!.date).toBe('2026-09-03')
  })

  it('handles split debit/credit columns (generic profile)', () => {
    const generic = getProfile('generic_csv')
    const rows = mapRows(
      [
        { Date: '2026-01-02', Description: 'Shop', 'Money Out': '10.00', 'Money In': '' },
        { Date: '2026-01-03', Description: 'Refund', 'Money Out': '', 'Money In': '4.00' },
      ],
      generic,
      opts,
    ).rows
    expect(rows[0]!.amount).toBe(1000) // out → spend (+)
    expect(rows[1]!.amount).toBe(-400) // in → refund (−)
  })

  it('synthesises a stable dedup key when the bank gives no id', () => {
    const generic = getProfile('generic_csv')
    const input = [{ Date: '2026-01-02', Description: 'Shop', Amount: '-10.00' }]
    const first = mapRows(input, generic, opts).rows[0]!
    expect(first.importRef).toMatch(/^syn_/)
    expect(first.status).toBe('new')
    // Re-mapping the same content with that ref known marks it a duplicate.
    const again = mapRows(input, generic, { ...opts, existingRefs: new Set([first.importRef]) }).rows[0]!
    expect(again.status).toBe('duplicate')
  })

  it('gives identical same-file rows distinct synthetic keys', () => {
    const generic = getProfile('generic_csv')
    const dup = { Date: '2026-01-02', Description: 'Shop', Amount: '-10.00' }
    const rows = mapRows([dup, { ...dup }], generic, opts).rows
    expect(rows[0]!.importRef).not.toBe(rows[1]!.importRef)
  })

  it('returns the resolved column mapping used, keyed to real headers', () => {
    const headers = ['Transaction ID', 'Date', 'Amount', 'Name', 'Category', 'Type', 'Currency', 'Local currency']
    const { mapping } = mapRows([monzoRow({})], monzo, opts, headers)
    expect(mapping.profileId).toBe('monzo_csv')
    expect(mapping.columns.description).toBe('Name')
    expect(mapping.columns.amount).toBe('Amount')
  })
})
