import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from './client'

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' })
}
