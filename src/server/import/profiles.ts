/** Bank import profiles (issue #27). A profile describes how to turn one bank's
 *  CSV export into Hearth's normalised rows: which columns hold which fields,
 *  how dates are written, which sign means "money out", and which rows are
 *  internal moves to exclude by default. The importer ([./map.ts](./map.ts)) is
 *  driven entirely by these — adding a bank is adding a profile, not code. */

/** For each Hearth field, the candidate CSV header names to look for, tried in
 *  order (case-insensitive). Missing optional fields are simply absent. */
export interface ColumnMap {
  importRef: string[] // bank's stable transaction id (dedup key)
  date: string[]
  /** Signed amount column (outflow one sign, inflow the other). Use this OR the
   *  debit/credit pair, not both. */
  amount?: string[]
  debit?: string[] // "money out" column (positive), for banks that split the two
  credit?: string[] // "money in" column (positive)
  currency?: string[]
  localCurrency?: string[]
  description: string[] // fallback chain: first non-empty wins
  note?: string[]
  category?: string[]
  type?: string[]
}

/** Order of the day/month/year parts in the bank's date column. ISO (YYYY-MM-DD)
 *  is always accepted as well, so this only disambiguates DD/MM vs MM/DD forms. */
export type DateOrder = 'DMY' | 'MDY' | 'YMD'

/** Which sign the bank uses for spending in its signed `amount` column.
 *  Hearth stores +spend / −refund, so `spend-negative` banks (Monzo, most UK
 *  banks: outflow is negative) get negated; `spend-positive` banks don't. */
export type SignConvention = 'spend-negative' | 'spend-positive'

/** A rule marking a row as an internal move (own-account / pot transfer),
 *  excluded from import by default. Matches case-insensitively. */
export interface InternalRule {
  field: 'type' | 'category'
  contains?: string // substring match
  equals?: string // whole-value match
}

export interface ImportProfile {
  id: string // stable key, also stored as import_batch.source
  label: string // shown in the bank picker, e.g. "Monzo"
  /** One-line UI hint on where to get the CSV. */
  instructions: string
  columns: ColumnMap
  dateOrder: DateOrder
  signConvention: SignConvention
  internalRules: InternalRule[]
  /** When true, rows with no importRef get a stable synthetic id derived from
   *  their contents, so id-less bank exports still de-duplicate on re-import. */
  syntheticRef?: boolean
}

const monzo: ImportProfile = {
  id: 'monzo_csv',
  label: 'Monzo',
  instructions: 'In the Monzo app: Statements → Download as CSV. One export is one person’s account.',
  columns: {
    importRef: ['Transaction ID', 'id'],
    date: ['Date'],
    amount: ['Amount'],
    currency: ['Currency'],
    localCurrency: ['Local currency'],
    description: ['Name', 'Description', 'Type'],
    note: ['Notes and #tags', 'Notes'],
    category: ['Category'],
    type: ['Type'],
  },
  dateOrder: 'DMY',
  signConvention: 'spend-negative',
  internalRules: [
    { field: 'type', contains: 'pot' },
    { field: 'type', equals: 'transfers' },
    { field: 'category', equals: 'transfers' },
  ],
}

const starling: ImportProfile = {
  id: 'starling_csv',
  label: 'Starling',
  instructions: 'In the Starling app or web: Account → Statements → Export as CSV.',
  columns: {
    // Starling exports carry no transaction id column, so we synthesise one.
    importRef: ['Transaction ID'],
    date: ['Date'],
    amount: ['Amount (GBP)', 'Amount'],
    currency: ['Currency'],
    description: ['Counter Party', 'Reference', 'Type'],
    note: ['Reference'],
    category: ['Spending Category'],
    type: ['Type'],
  },
  dateOrder: 'DMY',
  signConvention: 'spend-negative',
  internalRules: [
    { field: 'category', equals: 'transfers' },
    { field: 'type', contains: 'transfer' },
  ],
  syntheticRef: true,
}

const revolut: ImportProfile = {
  id: 'revolut_csv',
  label: 'Revolut',
  instructions: 'In the Revolut app: Account → Statement → Excel/CSV for the period you want.',
  columns: {
    importRef: ['Transaction ID'],
    date: ['Started Date', 'Completed Date', 'Date'],
    amount: ['Amount'],
    currency: ['Currency'],
    description: ['Description'],
    category: ['Category', 'Type'],
    type: ['Type'],
  },
  dateOrder: 'YMD',
  signConvention: 'spend-negative',
  internalRules: [
    { field: 'type', contains: 'transfer' },
    { field: 'type', contains: 'exchange' },
    { field: 'type', contains: 'topup' },
  ],
  syntheticRef: true,
}

/** Last-resort profile for any bank: common English header names, either date
 *  order accepted via ISO fallback, split debit/credit or a signed column, and
 *  a synthetic dedup key. Users pick this when their bank isn't listed. */
const generic: ImportProfile = {
  id: 'generic_csv',
  label: 'Other bank (generic CSV)',
  instructions:
    'Any CSV with a date, a description and an amount. Columns are matched by common names (Date, Description/Name/Payee, Amount, or Money Out/Money In).',
  columns: {
    importRef: ['Transaction ID', 'Transaction Id', 'ID', 'Reference'],
    date: ['Date', 'Transaction Date', 'Started Date', 'Completed Date'],
    amount: ['Amount', 'Value'],
    debit: ['Debit', 'Money Out', 'Paid Out', 'Withdrawal'],
    credit: ['Credit', 'Money In', 'Paid In', 'Deposit'],
    currency: ['Currency'],
    description: ['Description', 'Name', 'Payee', 'Counter Party', 'Details', 'Merchant'],
    note: ['Notes', 'Reference', 'Memo'],
    category: ['Category', 'Spending Category'],
    type: ['Type'],
  },
  dateOrder: 'DMY',
  signConvention: 'spend-negative',
  internalRules: [
    { field: 'category', equals: 'transfers' },
    { field: 'type', contains: 'transfer' },
  ],
  syntheticRef: true,
}

/** Registry, in the order shown in the picker. Monzo first (the original bank). */
export const IMPORT_PROFILES: ImportProfile[] = [monzo, starling, revolut, generic]

const BY_ID = new Map(IMPORT_PROFILES.map((p) => [p.id, p]))

export const DEFAULT_PROFILE_ID = monzo.id

/** Look up a profile by id, falling back to Monzo for legacy/unknown sources. */
export function getProfile(id: string | null | undefined): ImportProfile {
  return (id && BY_ID.get(id)) || monzo
}

/** Lightweight shape for the client's bank picker (no logic, just labels). */
export function listProfiles() {
  return IMPORT_PROFILES.map((p) => ({ id: p.id, label: p.label, instructions: p.instructions }))
}
