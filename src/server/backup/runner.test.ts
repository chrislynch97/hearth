import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { household } from '../db/schema'
import { applySnapshot, type Snapshot } from '../db/snapshot'
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

  it('writes a file that actually restores back into a fresh database', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    await addHousehold(db, 'secondary', 'weekly')

    const { file } = await runBackup(db, ['household'])

    // Read the on-disk backup and replay it through the real import path into an
    // empty database — the round-trip the runner never used to exercise.
    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
    const restored = await makeTestDb()
    await applySnapshot(restored as never, snapshot.tables)

    const rows = await restored.select().from(household)
    expect(rows.map((r) => r.id).sort()).toEqual(['household', 'secondary'])
  })

  it('writes atomically, leaving no stray .tmp file', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { file } = await runBackup(db, ['household'])

    const entries = readdirSync(dirname(file))
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false)
    expect(entries.filter((f) => f.endsWith('.json')).length).toBe(1)
  })

  it.skipIf(process.platform === 'win32')('writes the backup owner-only (0600)', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { file } = await runBackup(db, ['household'])

    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})
