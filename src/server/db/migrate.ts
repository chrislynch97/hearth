import { db } from './client'

// Drizzle's migrator is driver-specific, and the two engines we support
// (node-postgres for a real server, PGlite embedded) each have their own. Pick
// the matching one at runtime from the same DATABASE_URL signal client.ts uses,
// so `runMigrations()` works against whichever engine is live.
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL
  const isServerPg = !!url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))

  if (isServerPg) {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db as never, { migrationsFolder: './drizzle' })
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as never, { migrationsFolder: './drizzle' })
  }
}
