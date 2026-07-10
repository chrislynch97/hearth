import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'
import { parseCsv } from '../shared/csvParse'

describe('toCsv', () => {
  it('passes plain fields through unquoted', () => {
    expect(toCsv([['Groceries', 'Joint', '12.50']])).toBe('Groceries,Joint,12.50')
  })

  it('stringifies numbers', () => {
    expect(toCsv([['Total', 1250]])).toBe('Total,1250')
  })

  it('quotes fields containing a comma', () => {
    expect(toCsv([['Tesco, Metro', 'x']])).toBe('"Tesco, Metro",x')
  })

  it('quotes and doubles embedded double-quotes', () => {
    expect(toCsv([['24" TV', 'x']])).toBe('"24"" TV",x')
  })

  it('quotes fields containing a newline', () => {
    expect(toCsv([['line1\nline2', 'x']])).toBe('"line1\nline2",x')
  })

  it('joins rows with a newline', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\nc,d')
  })

  it('neutralizes cells that start a formula (CSV injection)', () => {
    // Merchant text imported verbatim from a statement must not evaluate on open.
    expect(toCsv([['=HYPERLINK("http://evil","x")']])).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(toCsv([['=cmd|/C calc', 'ok']])).toBe("'=cmd|/C calc,ok")
    expect(toCsv([['+1-800-EVIL']])).toBe("'+1-800-EVIL")
    expect(toCsv([['@SUM(A1:A9)']])).toBe("'@SUM(A1:A9)")
    expect(toCsv([['\t=1+1']])).toBe("'\t=1+1")
  })

  it('leaves plain numbers (including negatives) untouched', () => {
    // Financial exports are full of negative amounts — those are not formulas.
    expect(toCsv([['-12.50', '-5', '3.20']])).toBe('-12.50,-5,3.20')
    expect(toCsv([['Total', -1250]])).toBe('Total,-1250')
  })
})

describe('toCsv → parseCsv round-trip', () => {
  // The exporter (client) and importer parser (shared) must agree on escaping.
  // Whatever toCsv writes, parseCsv must read back cell-for-cell.
  const cases: Array<{ name: string; table: string[][] }> = [
    { name: 'plain data', table: [['Date', 'Payee', 'Amount'], ['2026-07-01', 'Coffee', '3.20']] },
    { name: 'commas in fields', table: [['Payee', 'Note'], ['Tesco, Metro', 'weekly, big shop']] },
    { name: 'double-quotes in fields', table: [['Item'], ['24" monitor'], ['a "quoted" word']] },
    { name: 'newlines in fields', table: [['Note'], ['first line\nsecond line']] },
    { name: 'the delimiter and quote together', table: [['A', 'B'], ['x,"y', 'plain']] },
    { name: 'leading and trailing spaces', table: [['  padded  ', 'tight']] },
    { name: 'empty fields alongside data', table: [['a', '', 'c']] },
  ]

  for (const { name, table } of cases) {
    it(`survives: ${name}`, () => {
      expect(parseCsv(toCsv(table))).toEqual(table)
    })
  }
})
