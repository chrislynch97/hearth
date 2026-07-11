import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { DB } from './client'
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

/** Restore a snapshot's rows into `db`: delete every table (children first) then
 *  re-insert the snapshot's rows (parents first), all in one atomic transaction.
 *  Shared by the `data.import` endpoint and the backup restore-verification check,
 *  so a verified backup is exercised through the exact same code path a real
 *  restore uses. Returns the number of rows inserted per table. */
export async function applySnapshot(db: DB, tables: Snapshot['tables']): Promise<Record<string, number>> {
  await db.transaction(async (tx) => {
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
  })
  return Object.fromEntries(ALL_TABLES.map(([n]) => [n, (tables[n] ?? []).length]))
}
