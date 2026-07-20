import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema'
import type { DB } from './client'

/** One PGlite (real Postgres in WASM) per worker process, anchored on
 *  globalThis so vitest's per-file module isolation reuses it instead of
 *  booting a fresh WASM instance for every test. The old instance-per-call
 *  design left hundreds of never-closed instances to be garbage-collected
 *  mid-run, which surfaced as unhandled "RuntimeError: Aborted()" rejections
 *  at teardown — and made instance boot (~1s) dominate suite time. */
const PGLITE_KEY = Symbol.for('hearth.testdb.pglite')

type PgliteHolder = { [PGLITE_KEY]?: PGlite }

/** Fresh, migrated database for tests. Reuses the worker's single PGlite,
 *  wiping all schemas (including drizzle's migration journal) and re-applying
 *  migrations, so each call still starts from a clean, fully-migrated state.
 *
 *  Contract: a call invalidates every handle returned earlier — they all point
 *  at the same instance, now reset. Finish with one db before making the next
 *  (fine for sequential tests; don't interleave two live handles). */
export async function makeTestDb(): Promise<DB> {
  const holder = globalThis as PgliteHolder
  let pglite = holder[PGLITE_KEY]
  if (pglite) {
    await pglite.exec(
      'drop schema public cascade; create schema public; drop schema if exists drizzle cascade',
    )
  } else {
    pglite = holder[PGLITE_KEY] = new PGlite() // in-memory, one per worker
  }
  const db = drizzle(pglite, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db as unknown as DB
}

/** Close the worker's PGlite, if any. Called from the server-project setup
 *  file's afterAll — a fork that exits with a live WASM instance intermittently
 *  aborts during teardown, which is where the suite's unhandled
 *  "RuntimeError: Aborted()" errors came from. */
export async function closeTestDb(): Promise<void> {
  const holder = globalThis as PgliteHolder
  const pglite = holder[PGLITE_KEY]
  if (!pglite) return
  delete holder[PGLITE_KEY]
  await pglite.close()
}
