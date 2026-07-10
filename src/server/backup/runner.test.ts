import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { household } from '../db/schema'
import { runBackup } from './runner'

// runBackup writes into `<DATABASE_URL dir>/backups`; point it at a throwaway
// temp dir so tests never touch ./data.
let tmp: string
let prevUrl: string | undefined

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hearth-backup-test-'))
  prevUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = `file:${join(tmp, 'app.db')}`
})

afterEach(() => {
  if (prevUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = prevUrl
  rmSync(tmp, { recursive: true, force: true })
})

async function addHousehold(db: Awaited<ReturnType<typeof makeTestDb>>, id: string, frequency: string): Promise<void> {
  await db.insert(household).values({ id, backupFrequency: frequency, createdAt: 1, updatedAt: 1 })
}

describe('runBackup', () => {
  it('stamps backupLastAt only on the given households (not the singleton row)', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'off')
    await addHousehold(db, 'secondary', 'daily')

    const { at } = await runBackup(db, ['secondary'])

    const [primary] = await db.select().from(household).where(eq(household.id, 'household'))
    const [secondary] = await db.select().from(household).where(eq(household.id, 'secondary'))
    // The secondary household — created with a random id — must get stamped (#13).
    expect(secondary!.backupLastAt).toBe(at)
    expect(primary!.backupLastAt).toBeNull()
  })

  it('stamps every household it was run for', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'a', 'daily')
    await addHousehold(db, 'b', 'weekly')

    const { at } = await runBackup(db, ['a', 'b'])

    const rows = await db.select().from(household)
    expect(rows.every((r) => r.backupLastAt === at)).toBe(true)
  })
})
