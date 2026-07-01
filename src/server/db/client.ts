import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.DATABASE_URL ?? 'file:./data/app.db'

// For a file-backed DB, ensure the parent directory exists — libsql won't create it,
// so a fresh clone (the `data/` dir is gitignored) would otherwise fail to open the DB.
if (url.startsWith('file:')) {
  const filePath = url.slice('file:'.length)
  mkdirSync(dirname(filePath), { recursive: true })
}

export const client = createClient({ url })
export const db = drizzle(client, { schema })
export type DB = typeof db
