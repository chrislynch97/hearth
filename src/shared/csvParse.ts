/** A small RFC-4180-ish CSV parser for imported files (Monzo statements).
 *  Handles quoted fields, embedded commas/newlines, and doubled quotes.
 *  Framework-agnostic and dependency-free so it can be unit-tested and reused. */

/** Parse CSV text into a matrix of string cells. Blank trailing lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Normalise newlines so \r\n and \r behave like \n.
  const src = text.replace(/\r\n?/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++ // skip the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully-empty rows (e.g. a trailing blank line parsed as ['']).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export interface CsvTable {
  headers: string[]
  rows: Array<Record<string, string>>
}

/** Parse CSV text into header-keyed row objects. The first row is the header. */
export function parseCsvTable(text: string): CsvTable {
  const matrix = parseCsv(text)
  if (matrix.length === 0) return { headers: [], rows: [] }
  const headers = matrix[0]!.map((h) => h.trim())
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? ''
    })
    return obj
  })
  return { headers, rows }
}
