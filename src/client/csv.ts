/** Minimal CSV export for reports. */

// A leading tab/CR also counts — spreadsheets trim it and then evaluate the rest.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
// Plain numeric literals (incl. negatives like -5.25) are safe and common in
// financial exports; don't neutralize those or we'd corrupt every amount column.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

/** Neutralize CSV formula injection: merchant/note text imported verbatim from
 *  bank statements can be `=HYPERLINK(...)`, `=cmd|/C calc`, etc., which Excel /
 *  LibreOffice evaluate on open. Prefix a `'` so the cell is treated as text. */
function neutralizeFormula(s: string): string {
  return FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = neutralizeFormula(String(cell))
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  downloadBlob(filename, new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}
