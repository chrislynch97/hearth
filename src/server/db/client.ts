import { mkdirSync } from 'node:fs'
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { Pool } from 'pg'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'

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

const DEFAULT_PGLITE_DIR = './data/pgdata'

function pgliteDir(url: string | undefined): string {
  if (!url) return DEFAULT_PGLITE_DIR
  // Accept `pglite:./path`, `pglite://./path`, or a bare filesystem path.
  const stripped = url.replace(/^pglite:(\/\/)?/, '')
  return stripped.length > 0 ? stripped : DEFAULT_PGLITE_DIR
}

/** The canonical database type. Both engines expose the identical pg-core query
 *  API; we type against node-postgres (the production driver) and treat the
 *  embedded PGlite handle as the same shape. */
export type DB = NodePgDatabase<typeof schema>

function makeDb(): { db: DB; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL
  const isServerPg = !!url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))

  if (isServerPg) {
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

/** The handle drizzle passes to a `db.transaction(tx => …)` callback. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

/** Either the pooled connection or an open transaction. Helpers typed with this
 *  can run standalone or be threaded into a caller's transaction so several
 *  writes commit atomically — the fix for the read-then-write races that were
 *  invisible under SQLite's single writer but real under Postgres concurrency. */
export type DBOrTx = DB | Tx
