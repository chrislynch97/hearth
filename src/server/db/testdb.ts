import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from './schema'

/** Fresh in-memory database with migrations applied — for tests.
 *  Note: bare `:memory:` cannot run interactive `db.transaction` (libsql opens a
 *  separate, empty connection for it), so whole-database ops use `db.batch`. */
export async function makeTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}
