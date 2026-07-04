/** Pure Monzo-CSV mapping (spec §5.3). Turns header-keyed CSV rows into
 *  normalised, classified entries ready for the review-before-commit preview.
 *  No DB or IO — the set of already-imported refs is passed in. */

import { toMinor } from '../../shared/money'

export type MonzoRowStatus = 'new' | 'duplicate' | 'excluded' | 'foreign' | 'error'

export interface MappedRow {
  index: number // position in the file (stable key)
  importRef: string
  date: string // YYYY-MM-DD ('' when unparseable)
  description: string
  note: string
  amount: number // Hearth minor units (+ spend / − refund)
  currency: string
  monzoCategory: string
  foreign: boolean
  internal: boolean // pot transfer / internal move
  status: MonzoRowStatus
  error?: string
  raw: Record<string, string>
}

export interface MapOptions {
  currencyCode: string
  decimalPlaces: number
  existingRefs?: ReadonlySet<string>
}

/** First non-empty value among the candidate header names (case-insensitive). */
function pick(row: Record<string, string>, names: string[]): string {
  for (const n of names) {
    const v = row[n]
    if (v != null && v.trim() !== '') return v.trim()
  }
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v
  for (const n of names) {
    const v = lower[n.toLowerCase()]
    if (v != null && v.trim() !== '') return v.trim()
  }
  return ''
}

/** Monzo dates are DD/MM/YYYY; also accept ISO. Returns null if unparseable. */
function parseDate(s: string): string | null {
  const t = s.trim()
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

function parseAmount(s: string): number | null {
  const t = s.trim().replace(/,/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** A row is an internal move (excluded by default) if its type/category marks a
 *  pot transfer or a transfer between the user's own accounts. */
function isInternal(type: string, category: string): boolean {
  const t = type.toLowerCase()
  const c = category.toLowerCase()
  return t.includes('pot') || t === 'transfers' || c === 'transfers'
}

/** Map + classify Monzo rows. `existingRefs` marks already-imported transactions
 *  as duplicates so re-importing the same export is safe. */
export function mapMonzoRows(rows: Array<Record<string, string>>, opts: MapOptions): MappedRow[] {
  const existing = opts.existingRefs ?? new Set<string>()
  return rows.map((raw, index) => {
    const importRef = pick(raw, ['Transaction ID', 'Transaction id', 'id'])
    const dateRaw = pick(raw, ['Date'])
    const amountRaw = pick(raw, ['Amount'])
    const currency = pick(raw, ['Currency']) || opts.currencyCode
    const localCurrency = pick(raw, ['Local currency'])
    const type = pick(raw, ['Type'])
    const monzoCategory = pick(raw, ['Category'])
    const description = pick(raw, ['Name', 'Description', 'Type']) || '(no description)'
    const note = pick(raw, ['Notes and #tags', 'Notes'])

    const date = parseDate(dateRaw)
    const monzoAmount = parseAmount(amountRaw)
    const foreign =
      currency.toUpperCase() !== opts.currencyCode.toUpperCase() ||
      (localCurrency !== '' && localCurrency.toUpperCase() !== currency.toUpperCase())
    const internal = isInternal(type, monzoCategory)

    const base = {
      index,
      importRef,
      date: date ?? '',
      description,
      note,
      // Hearth stores +spend/−refund; Monzo stores −out/+in, so negate.
      amount: monzoAmount === null ? 0 : toMinor(-monzoAmount, opts.decimalPlaces),
      currency,
      monzoCategory,
      foreign,
      internal,
      raw,
    }

    // Classification precedence: error → duplicate → excluded → foreign → new.
    let status: MonzoRowStatus
    let error: string | undefined
    if (!importRef) {
      status = 'error'
      error = 'Missing Transaction ID'
    } else if (date === null) {
      status = 'error'
      error = `Unparseable date "${dateRaw}"`
    } else if (monzoAmount === null) {
      status = 'error'
      error = `Unparseable amount "${amountRaw}"`
    } else if (existing.has(importRef)) {
      status = 'duplicate'
    } else if (internal) {
      status = 'excluded'
    } else if (foreign) {
      status = 'foreign'
    } else {
      status = 'new'
    }

    return { ...base, status, error }
  })
}
