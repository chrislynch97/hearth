import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { household } from '../db/schema'
import { applySnapshot, type Snapshot } from '../db/snapshot'
import { decryptSnapshot } from './encrypt'
import { runBackup } from './runner'

// runBackup writes into `<DATABASE_URL dir>/backups`; point it at a throwaway
// temp dir so tests never touch ./data. (The actual DB under test is a separate
// in-memory PGlite from makeTestDb; this URL only drives the backup directory.)
let tmp: string
let prevUrl: string | undefined

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hearth-backup-test-'))
  prevUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = `pglite:${join(tmp, 'pgdata')}`
})

afterEach(() => {
  if (prevUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = prevUrl
  // Clear any off-site config a test set, so it can't leak into other tests.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('HEARTH_BACKUP_')) delete process.env[k]
  }
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

async function addHousehold(db: Awaited<ReturnType<typeof makeTestDb>>, id: string, frequency: string): Promise<void> {
  await db.insert(household).values({ id, backupFrequency: frequency, createdAt: new Date(1), updatedAt: new Date(1) })
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
    expect(secondary!.backupLastAt?.getTime()).toBe(at)
    expect(primary!.backupLastAt).toBeNull()
  })

  it('stamps every household it was run for', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'a', 'daily')
    await addHousehold(db, 'b', 'weekly')

    const { at } = await runBackup(db, ['a', 'b'])

    const rows = await db.select().from(household)
    expect(rows.every((r) => r.backupLastAt?.getTime() === at)).toBe(true)
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

  it('writes a plaintext .json backup when no passphrase is set (the default)', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { file } = await runBackup(db, ['household'])

    expect(file.endsWith('.json')).toBe(true)
    expect(file.endsWith('.json.enc')).toBe(false)
  })

  it('encrypts the local backup at rest when HEARTH_BACKUP_PASSPHRASE is set (#46)', async () => {
    process.env.HEARTH_BACKUP_PASSPHRASE = 'test-passphrase'

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    await addHousehold(db, 'secondary', 'weekly')

    const { file, at } = await runBackup(db, ['household'])

    // The on-disk file is the encrypted envelope, not plaintext JSON...
    expect(file.endsWith('.json.enc')).toBe(true)
    const bytes = readFileSync(file)
    expect(() => JSON.parse(bytes.toString('utf8'))).toThrow() // not readable as plaintext
    // ...but decrypts back to a snapshot that restores every household...
    const snapshot = JSON.parse(decryptSnapshot(bytes, 'test-passphrase')) as Snapshot
    expect(snapshot.tables.household!.map((r) => r['id']).sort()).toEqual(['household', 'secondary'])
    // ...and the run still verified and stamped the household as backed up.
    const [row] = await db.select().from(household).where(eq(household.id, 'household'))
    expect(row!.backupLastAt?.getTime()).toBe(at)
  })

  it('reports no off-site outcome when off-site backups are disabled (the default)', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const result = await runBackup(db, ['household'])

    expect(result.offsite).toBeUndefined()
  })

  it('ships an encrypted off-site copy when configured, decryptable back to the snapshot', async () => {
    const offsiteDir = join(tmp, 'offsite')
    process.env.HEARTH_BACKUP_OFFSITE = 'directory'
    process.env.HEARTH_BACKUP_DIR = offsiteDir
    process.env.HEARTH_BACKUP_PASSPHRASE = 'test-passphrase'

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    await addHousehold(db, 'secondary', 'weekly')

    const result = await runBackup(db, ['household'])

    expect(result.offsite).toEqual({ kind: 'directory', ok: true })
    const [encFile] = readdirSync(offsiteDir)
    expect(encFile).toMatch(/^hearth-backup-.*\.json\.enc$/)
    const snapshot = JSON.parse(
      decryptSnapshot(readFileSync(join(offsiteDir, encFile!)), 'test-passphrase'),
    ) as Snapshot
    expect(snapshot.tables.household!.map((r) => r['id']).sort()).toEqual(['household', 'secondary'])
  })

  it('still writes a good local backup when the off-site upload fails', async () => {
    process.env.HEARTH_BACKUP_OFFSITE = 'webhook'
    process.env.HEARTH_BACKUP_WEBHOOK_URL = 'https://example.test/backup'
    process.env.HEARTH_BACKUP_PASSPHRASE = 'test-passphrase'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500, statusText: 'err' })))

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { file, offsite } = await runBackup(db, ['household'])

    // Local backup is written and the household is still stamped as backed up.
    // (A passphrase is set, so the local copy is the encrypted `.json.enc`.)
    expect(file.endsWith('.json.enc')).toBe(true)
    expect(readdirSync(dirname(file)).filter((f) => f.endsWith('.json.enc')).length).toBe(1)
    const [row] = await db.select().from(household).where(eq(household.id, 'household'))
    expect(row!.backupLastAt).not.toBeNull()
    // ...but the off-site failure is reported, not thrown.
    expect(offsite?.ok).toBe(false)
    expect(offsite?.kind).toBe('webhook')
  })

  it('does not fail the local backup when off-site is misconfigured', async () => {
    process.env.HEARTH_BACKUP_OFFSITE = 'directory' // missing HEARTH_BACKUP_DIR / passphrase
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { file, offsite } = await runBackup(db, ['household'])

    expect(readdirSync(dirname(file)).filter((f) => f.endsWith('.json')).length).toBe(1)
    expect(offsite?.ok).toBe(false)
  })
})
