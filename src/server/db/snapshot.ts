import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DB } from './client'
import { ALL_TABLES } from './tables'

export const EXPORT_VERSION = 1

export interface Snapshot {
  version: number
  exportedAt: number
  tables: Record<string, Array<Record<string, unknown>>>
}

/** The portability contract: every table's rows as JSON. Shared by the manual
 *  export endpoint and the automatic backup runner. */
export async function buildSnapshot(db: DB): Promise<Snapshot> {
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  for (const [name, table] of ALL_TABLES) {
    tables[name] = (await db.select().from(table as SQLiteTable)) as Array<Record<string, unknown>>
  }
  return { version: EXPORT_VERSION, exportedAt: Date.now(), tables }
}
