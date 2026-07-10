import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from './schema'

// One temp dir per worker, holding this worker's test databases. Removed when the
// worker exits, so the run leaves nothing behind.
const baseDir = mkdtempSync(join(tmpdir(), 'hearth-test-'))
process.once('exit', () => {
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best effort: a leftover temp dir is harmless
  }
})
let seq = 0

/** Fresh, isolated database with migrations applied — for tests.
 *  File-backed (not bare `:memory:`) so interactive `db.transaction` works:
 *  libsql runs a transaction on its own connection, which a `:memory:` database
 *  can't share, so it would open a separate *empty* one and lose the writes.
 *  The production code paths rely on real transactions for atomicity, so the
 *  tests must exercise them on a database that actually supports them. */
export async function makeTestDb() {
  const file = join(baseDir, `t${seq++}.db`)
  const client = createClient({ url: `file:${file.replace(/\\/g, '/')}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}
