import { mkdirSync } from 'node:fs'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { Pool } from 'pg'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'
import { isServerPgUrl, pgliteDir } from './target'

// DATABASE_URL selects the engine:
//   postgres:// | postgresql://  → real Postgres server via node-postgres Pool
//                                  (production / SaaS; supports multiple app
//                                  instances against one database).
//   pglite:<dir> | <unset>       → embedded PGlite (Postgres compiled to WASM)
//                                  backed by a local directory. Zero-config, no
//                                  server — the self-host / dev / demo default,
//                                  the same "just runs from a folder" DX SQLite
//                                  gave us, but with real Postgres semantics.
// Both share one pg-core schema and one query API, so nothing downstream
// (routers, snapshot, tests) cares which engine is live.

// How a URL maps to an engine and a location lives in `target.ts`, so tools can
// ask what a DATABASE_URL means without importing this module (and thereby
// opening — or creating — the database).

/** The canonical database type. Both engines expose the identical pg-core query
 *  API; we type against node-postgres (the production driver) and treat the
 *  embedded PGlite handle as the same shape. */
export type DB = NodePgDatabase<typeof schema>

function makeDb(): { db: DB; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL

  if (isServerPgUrl(url)) {
    const pool = new Pool({ connectionString: url })
    return { db: drizzleNodePg(pool, { schema }), close: () => pool.end() }
  }

  const dir = pgliteDir(url)
  mkdirSync(dir, { recursive: true }) // PGlite won't create a missing parent dir
  const pglite = new PGlite(dir)
  return { db: drizzlePglite(pglite, { schema }) as unknown as DB, close: () => pglite.close() }
}

const created = makeDb()

export const db = created.db

/** Close the underlying connection cleanly on shutdown (pool.end / pglite.close). */
export const closeDb = created.close

export { describeDatabase } from './target'

/** The handle drizzle passes to a `db.transaction(tx => …)` callback. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

/** Either the pooled connection or an open transaction. Helpers typed with this
 *  can run standalone or be threaded into a caller's transaction so several
 *  writes commit atomically — the fix for the read-then-write races that were
 *  invisible under SQLite's single writer but real under Postgres concurrency. */
export type DBOrTx = DB | Tx
