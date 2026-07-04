import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvTable } from './csvParse'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('handles quoted fields with commas and quotes', () => {
    expect(parseCsv('name,note\n"Tesco, Metro","he said ""hi"""')).toEqual([
      ['name', 'note'],
      ['Tesco, Metro', 'he said "hi"'],
    ])
  })
  it('handles embedded newlines inside quotes', () => {
    expect(parseCsv('a\n"line1\nline2",b')).toEqual([['a'], ['line1\nline2', 'b']])
  })
  it('normalises CRLF and drops trailing blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('preserves empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })
})

describe('parseCsvTable', () => {
  it('keys rows by trimmed headers', () => {
    const { headers, rows } = parseCsvTable('Transaction ID, Amount\ntx_1,-12.50')
    expect(headers).toEqual(['Transaction ID', 'Amount'])
    expect(rows).toEqual([{ 'Transaction ID': 'tx_1', Amount: '-12.50' }])
  })
  it('returns empty for empty input', () => {
    expect(parseCsvTable('')).toEqual({ headers: [], rows: [] })
  })
})
