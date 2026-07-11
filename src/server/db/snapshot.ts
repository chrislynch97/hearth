import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DB } from './client'
import { ALL_TABLES } from './tables'

export const EXPORT_VERSION = 1

/** Insert at most this many rows per statement, so a very large table doesn't
 *  blow past SQLite's bound-variable limit in a single insert. */
const INSERT_CHUNK = 200

export interface Snapshot {
  version: number
  exportedAt: number
  tables: Record<string, Array<Record<string, unknown>>>
}

type BatchArg = Parameters<DB['batch']>[0]
type BatchStatement = BatchArg[number]

/** The portability contract: every table's rows as JSON. Shared by the manual
 *  export endpoint and the automatic backup runner. */
export async function buildSnapshot(db: DB): Promise<Snapshot> {
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  for (const [name, table] of ALL_TABLES) {
    tables[name] = (await db.select().from(table as SQLiteTable)) as Array<Record<string, unknown>>
  }
  return { version: EXPORT_VERSION, exportedAt: Date.now(), tables }
}

/** Restore a snapshot's rows into `db`: delete every table (children first) then
 *  re-insert the snapshot's rows (parents first), all in one atomic libsql batch.
 *  Shared by the `data.import` endpoint and the backup restore-verification check,
 *  so a verified backup is exercised through the exact same code path a real
 *  restore uses. Returns the number of rows inserted per table. */
export async function applySnapshot(db: DB, tables: Snapshot['tables']): Promise<Record<string, number>> {
  const statements: BatchStatement[] = []
  for (const [, table] of [...ALL_TABLES].reverse()) {
    statements.push(db.delete(table as SQLiteTable))
  }
  for (const [name, table] of ALL_TABLES) {
    const rows = tables[name] ?? []
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK)
      if (chunk.length > 0) {
        statements.push(db.insert(table as SQLiteTable).values(chunk as never))
      }
    }
  }
  if (statements.length > 0) {
    await db.batch(statements as unknown as BatchArg)
  }
  return Object.fromEntries(ALL_TABLES.map(([n]) => [n, (tables[n] ?? []).length]))
}
