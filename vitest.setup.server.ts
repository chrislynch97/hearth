import { afterAll } from 'vitest'
import { closeTestDb } from './src/server/db/testdb'

// Close the file's shared PGlite before the fork exits — see closeTestDb.
afterAll(async () => {
  await closeTestDb()
})
