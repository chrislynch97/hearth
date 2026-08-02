import { eq, getTableColumns, inArray } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { DB } from './client'
import { household, membership, subscription } from './schema'
import { ALL_TABLES } from './tables'

export const EXPORT_VERSION = 1

/** Insert at most this many rows per statement, so a very large table doesn't
 *  blow past Postgres's 65535 bound-parameter limit in a single insert. */
const INSERT_CHUNK = 200

export interface Snapshot {
  version: number
  exportedAt: number
  tables: Record<string, Array<Record<string, unknown>>>
}

/** Timestamp columns are `timestamptz` in Postgres and surface as JS `Date`s in
 *  the app. The portability format, however, deliberately stays engine-agnostic
 *  epoch-millis NUMBERS — so an export is plain JSON that older (SQLite-era)
 *  exports still match, and importing one needs no bespoke conversion. We
 *  therefore marshal Date→millis on export and millis→Date on import, keyed on
 *  the JS property names of every `date`-typed column per table. */
const DATE_COLUMNS: Map<PgTable, ReadonlySet<string>> = new Map(
  ALL_TABLES.map(([, table]) => {
    const dateKeys = Object.entries(getTableColumns(table))
      .filter(([, col]) => col.dataType === 'date')
      .map(([key]) => key)
    return [table, new Set(dateKeys)] as const
  }),
)

/** Serialize a row for export: Date timestamp fields → epoch-millis numbers. */
function toExportRow(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const dateKeys = DATE_COLUMNS.get(table)
  if (!dateKeys || dateKeys.size === 0) return row
  const out: Record<string, unknown> = { ...row }
  for (const key of dateKeys) {
    const value = out[key]
    if (value instanceof Date) out[key] = value.getTime()
  }
  return out
}

/** Rehydrate an imported row: epoch-millis numbers back into Date objects for
 *  the `timestamptz` columns (also tolerates ISO strings, defensively). */
function fromImportRow(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const dateKeys = DATE_COLUMNS.get(table)
  if (!dateKeys || dateKeys.size === 0) return row
  const out: Record<string, unknown> = { ...row }
  for (const key of dateKeys) {
    const value = out[key]
    if (value === null || value === undefined || value instanceof Date) continue
    if (typeof value === 'number' || typeof value === 'string') out[key] = new Date(value)
  }
  return out
}

/** The portability contract: every table's rows as JSON. Shared by the manual
 *  export endpoint and the automatic backup runner. */
export async function buildSnapshot(db: DB): Promise<Snapshot> {
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  for (const [name, table] of ALL_TABLES) {
    const rows = (await db.select().from(table as PgTable)) as Array<Record<string, unknown>>
    tables[name] = rows.map((r) => toExportRow(table, r))
  }
  return { version: EXPORT_VERSION, exportedAt: Date.now(), tables }
}

/** User columns that must never leave the instance in a per-household export:
 *  credential + second-factor secrets. Redacted to null so the export stays a
 *  faithful portability artifact of the household's people without carrying the
 *  secrets that authenticate them. */
const REDACTED_USER_KEYS = ['passwordHash', 'mfaSecret', 'mfaRecoveryCodes', 'mfaLastStep'] as const

function redactUser(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const key of REDACTED_USER_KEYS) out[key] = null
  return out
}

/** One household's slice of the database, in the same JSON shape as buildSnapshot
 *  but every table filtered to `householdId` — the tenant-facing portability
 *  contract (issue #110). A household owner can take their own data out without
 *  the instance-wide export that reads every tenant. `household` is the one
 *  matching row; `user` is limited to this household's members and stripped of
 *  credentials; every other table is scoped by its `household_id`. Excludes the
 *  same operational tables buildSnapshot does — see SNAPSHOT_EXCLUDED. */
export async function buildHouseholdSnapshot(db: DB, householdId: string): Promise<Snapshot> {
  const memberships = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.householdId, householdId))
  const userIds = [...new Set(memberships.map((m) => m.userId))]

  const tables: Record<string, Array<Record<string, unknown>>> = {}
  for (const [name, table] of ALL_TABLES) {
    const cols = getTableColumns(table)
    let rows: Array<Record<string, unknown>>
    if (name === 'household') {
      rows = (await db
        .select()
        .from(table as PgTable)
        .where(eq(cols['id'] as PgColumn, householdId))) as Array<Record<string, unknown>>
    } else if (name === 'user') {
      rows =
        userIds.length === 0
          ? []
          : ((await db
              .select()
              .from(table as PgTable)
              .where(inArray(cols['id'] as PgColumn, userIds))) as Array<Record<string, unknown>>).map(redactUser)
    } else {
      rows = (await db
        .select()
        .from(table as PgTable)
        .where(eq(cols['householdId'] as PgColumn, householdId))) as Array<Record<string, unknown>>
    }
    tables[name] = rows.map((r) => toExportRow(table, r))
  }
  return { version: EXPORT_VERSION, exportedAt: Date.now(), tables }
}

/** Restore a snapshot's rows into `db`: delete every table (children first) then
 *  re-insert the snapshot's rows (parents first), all in one atomic transaction.
 *  Shared by the `data.import` endpoint and the backup restore-verification check,
 *  so a verified backup is exercised through the exact same code path a real
 *  restore uses. Returns the number of rows inserted per table. */
export async function applySnapshot(db: DB, tables: Snapshot['tables']): Promise<Record<string, number>> {
  await db.transaction(async (tx) => {
    // Entitlement sits outside the portability contract in BOTH directions (#232):
    // a snapshot can't forge it, and mustn't destroy it either. `subscription`
    // hangs off `household` with ON DELETE CASCADE, so the wipe below would take
    // every paying household's subscription with it — a restore-from-backup would
    // lock the whole instance out of its own service. Carry it across instead.
    const entitlements = await tx.select().from(subscription)

    for (const [, table] of [...ALL_TABLES].reverse()) {
      await tx.delete(table as PgTable)
    }
    for (const [name, table] of ALL_TABLES) {
      const rows = tables[name] ?? []
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => fromImportRow(table, r))
        if (chunk.length > 0) await tx.insert(table as PgTable).values(chunk as never)
      }
    }

    // Only for households the snapshot brought back — one from another instance
    // has different ids, and an entitlement with no household is meaningless.
    const restored = new Set((await tx.select({ id: household.id }).from(household)).map((h) => h.id))
    const survivors = entitlements.filter((s) => restored.has(s.householdId))
    if (survivors.length > 0) await tx.insert(subscription).values(survivors)
  })
  return Object.fromEntries(ALL_TABLES.map(([n]) => [n, (tables[n] ?? []).length]))
}
