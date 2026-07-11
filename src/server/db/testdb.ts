import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'
import type { DB } from './client'

/** Fresh, isolated database with migrations applied — for tests. Each call
 *  spins up its own in-memory PGlite (real Postgres compiled to WASM), so tests
 *  exercise the actual production engine — real interactive `db.transaction`,
 *  enforced foreign keys and cascades — rather than the old in-memory SQLite
 *  that couldn't do any of those. In-memory needs no temp files and is torn down
 *  when the instance is garbage-collected at end of test. */
export async function makeTestDb(): Promise<DB> {
  const pglite = new PGlite() // in-memory, isolated per call
  const db = drizzle(pglite, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db as unknown as DB
}
