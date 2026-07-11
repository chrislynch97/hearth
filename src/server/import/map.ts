/** Profile-driven CSV mapping (issue #27). Turns header-keyed CSV rows into
 *  normalised, classified entries ready for the review-before-commit preview,
 *  using an [ImportProfile](./profiles.ts) to decide columns, date format, sign
 *  convention and internal-move rules. No DB or IO — the set of already-imported
 *  refs is passed in. Replaces the old Monzo-only mapper. */

import { toMinor } from '../../shared/money'
import type { ColumnMap, ImportProfile } from './profiles'

export type RowStatus = 'new' | 'duplicate' | 'excluded' | 'foreign' | 'error'

export interface MappedRow {
  index: number // position in the file (stable key)
  importRef: string
  date: string // YYYY-MM-DD ('' when unparseable)
  description: string
  note: string
  amount: number // Hearth minor units (+ spend / − refund)
  currency: string
  category: string // the bank's own category label, if any
  foreign: boolean
  internal: boolean // own-account / pot transfer
  status: RowStatus
  error?: string
  raw: Record<string, string>
}

export interface MapOptions {
  currencyCode: string
  decimalPlaces: number
  existingRefs?: ReadonlySet<string>
}

/** The resolved column mapping actually used, persisted to import_batch.mapping.
 *  Each field maps to the CSV header it matched (or null if the column is
 *  absent). `profileId` records which profile produced it. */
export interface ResolvedMapping {
  profileId: string
  columns: Record<string, string | null>
}

/** First non-empty value among the candidate header names (case-insensitive). */
function pick(row: Record<string, string>, names: string[] | undefined): string {
  if (!names) return ''
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

/** Parse a date column into YYYY-MM-DD given the profile's day/month/year order.
 *  ISO input is always accepted; separators may be / - or . Returns null if
 *  unparseable. */
function parseDate(s: string, order: ImportProfile['dateOrder']): string | null {
  const t = s.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const parts = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/.exec(t)
  if (!parts) return null
  const [a, b, c] = [parts[1]!, parts[2]!, parts[3]!]
  const year = order === 'YMD' ? a : c
  const month = order === 'MDY' ? a : b
  const day = order === 'YMD' ? c : order === 'MDY' ? b : a
  if (year.length !== 4) return null // guard against a misordered profile
  const m = Number(month),
    d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseNumber(s: string): number | null {
  // Strip currency symbols/spaces/thousands separators; keep sign and point.
  const t = s.trim().replace(/[^0-9.\-+]/g, '')
  if (t === '' || t === '-' || t === '+') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** The source amount as a signed major-unit number in Hearth's convention
 *  (+ spend / − refund), or null if unreadable. Supports either a single signed
 *  column or a split debit/credit pair. */
function readAmount(row: Record<string, string>, cols: ColumnMap, sign: ImportProfile['signConvention']): number | null {
  // A signed amount column wins when present (profiles may declare both a signed
  // column and a debit/credit pair to cover either export shape).
  const signed = parseNumber(pick(row, cols.amount))
  if (signed !== null) {
    // spend-negative banks store outflow as negative, so negate to Hearth's +spend.
    return sign === 'spend-negative' ? -signed : signed
  }
  if (cols.debit || cols.credit) {
    const debit = parseNumber(pick(row, cols.debit)) // money out
    const credit = parseNumber(pick(row, cols.credit)) // money in
    if (debit === null && credit === null) return null
    return (debit ?? 0) - (credit ?? 0) // out is a spend (+), in is a refund (−)
  }
  return null
}

function matchesRule(row: Record<string, string>, cols: ColumnMap, profile: ImportProfile): boolean {
  const type = pick(row, cols.type).toLowerCase()
  const category = pick(row, cols.category).toLowerCase()
  return profile.internalRules.some((rule) => {
    const value = rule.field === 'type' ? type : category
    if (value === '') return false
    if (rule.equals != null) return value === rule.equals.toLowerCase()
    if (rule.contains != null) return value.includes(rule.contains.toLowerCase())
    return false
  })
}

/** A small, stable, non-cryptographic hash (FNV-1a) → base36 string. Used to
 *  synthesise a dedup key for banks whose exports carry no transaction id. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Resolve each field's candidate list to the first header that exists in the
 *  file (case-insensitive). Records what was actually used, for audit. */
function resolveColumns(headers: string[], cols: ColumnMap): Record<string, string | null> {
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]))
  const find = (names?: string[]): string | null => {
    if (!names) return null
    for (const n of names) {
      const hit = lower.get(n.toLowerCase())
      if (hit) return hit
    }
    return null
  }
  const out: Record<string, string | null> = {}
  for (const [field, names] of Object.entries(cols)) out[field] = find(names as string[])
  return out
}

/** Map + classify rows using a bank profile. `existingRefs` marks already-
 *  imported transactions as duplicates so re-importing the same export is safe.
 *  `headers` (when given) yields the resolved mapping to persist. */
export function mapRows(
  rows: Array<Record<string, string>>,
  profile: ImportProfile,
  opts: MapOptions,
  headers?: string[],
): { rows: MappedRow[]; mapping: ResolvedMapping } {
  const existing = opts.existingRefs ?? new Set<string>()
  const cols = profile.columns
  // For synthetic refs: disambiguate identical rows within one file by counting
  // how many times the same content signature has been seen so far.
  const sigCounts = new Map<string, number>()

  const mapped = rows.map((raw, index): MappedRow => {
    let importRef = pick(raw, cols.importRef)
    const dateRaw = pick(raw, cols.date)
    const currency = pick(raw, cols.currency) || opts.currencyCode
    const localCurrency = pick(raw, cols.localCurrency)
    const category = pick(raw, cols.category)
    const description = pick(raw, cols.description) || '(no description)'
    const note = pick(raw, cols.note)

    const date = parseDate(dateRaw, profile.dateOrder)
    const major = readAmount(raw, cols, profile.signConvention)
    const amount = major === null ? 0 : toMinor(major, opts.decimalPlaces)
    const foreign =
      currency.toUpperCase() !== opts.currencyCode.toUpperCase() ||
      (localCurrency !== '' && localCurrency.toUpperCase() !== currency.toUpperCase())
    const internal = matchesRule(raw, cols, profile)

    // Synthesise a stable dedup key when the bank gives no transaction id.
    if (!importRef && profile.syntheticRef && date && major !== null) {
      const sig = `${date}|${amount}|${description.toLowerCase()}`
      const seen = sigCounts.get(sig) ?? 0
      sigCounts.set(sig, seen + 1)
      importRef = `syn_${hash(sig)}_${seen}`
    }

    // Classification precedence: error → duplicate → excluded → foreign → new.
    let status: RowStatus
    let error: string | undefined
    if (!importRef) {
      status = 'error'
      error = profile.syntheticRef ? 'Row is missing a date or amount' : 'Missing transaction id'
    } else if (date === null) {
      status = 'error'
      error = `Unparseable date "${dateRaw}"`
    } else if (major === null) {
      status = 'error'
      error = 'Unparseable amount'
    } else if (existing.has(importRef)) {
      status = 'duplicate'
    } else if (internal) {
      status = 'excluded'
    } else if (foreign) {
      status = 'foreign'
    } else {
      status = 'new'
    }

    return {
      index,
      importRef,
      date: date ?? '',
      description,
      note,
      amount,
      currency,
      category,
      foreign,
      internal,
      status,
      error,
      raw,
    }
  })

  const mapping: ResolvedMapping = {
    profileId: profile.id,
    columns: headers ? resolveColumns(headers, cols) : {},
  }
  return { rows: mapped, mapping }
}
