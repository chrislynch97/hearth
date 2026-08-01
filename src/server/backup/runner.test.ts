import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { household } from '../db/schema'
import { applySnapshot, type Snapshot } from '../db/snapshot'
import { decryptSnapshot } from './encrypt'
import { assertBackupConfig, backupDir, backupPrimary, keepBackups, runBackup } from './runner'

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

// Retention and the local backup directory are operator-tunable (#53).
describe('keepBackups', () => {
  it('defaults to 14 when unset or empty', () => {
    expect(keepBackups({})).toBe(14)
    expect(keepBackups({ HEARTH_BACKUP_KEEP: '   ' })).toBe(14)
  })

  it('honours a positive integer', () => {
    expect(keepBackups({ HEARTH_BACKUP_KEEP: '3' })).toBe(3)
    expect(keepBackups({ HEARTH_BACKUP_KEEP: ' 30 ' })).toBe(30)
  })

  // A retention of 0 would prune the snapshot we just wrote.
  it('clamps 0 up to 1 rather than keeping nothing', () => {
    expect(keepBackups({ HEARTH_BACKUP_KEEP: '0' })).toBe(1)
  })

  it('falls back to the default on a non-integer, rather than failing the backup', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(keepBackups({ HEARTH_BACKUP_KEEP: 'lots' })).toBe(14)
    expect(keepBackups({ HEARTH_BACKUP_KEEP: '-2' })).toBe(14)
    expect(keepBackups({ HEARTH_BACKUP_KEEP: '2.5' })).toBe(14)
  })
})

describe('backupDir', () => {
  it('derives ./data/backups from an unset DATABASE_URL', () => {
    expect(backupDir({})).toBe(join('./data', 'backups'))
  })

  it('sits alongside an embedded PGlite data dir', () => {
    expect(backupDir({ DATABASE_URL: 'pglite:/srv/hearth/pgdata' })).toBe(join('/srv/hearth', 'backups'))
  })

  it('falls back to ./data/backups for a real Postgres server', () => {
    expect(backupDir({ DATABASE_URL: 'postgres://user@host/db' })).toBe(join('./data', 'backups'))
  })

  it('lets HEARTH_BACKUP_LOCAL_DIR override the derived path', () => {
    expect(
      backupDir({ DATABASE_URL: 'pglite:/srv/hearth/pgdata', HEARTH_BACKUP_LOCAL_DIR: '/mnt/other/backups' }),
    ).toBe('/mnt/other/backups')
  })

  it('ignores a blank override', () => {
    expect(backupDir({ HEARTH_BACKUP_LOCAL_DIR: '  ' })).toBe(join('./data', 'backups'))
  })
})

describe('backup retention', () => {
  it('prunes to HEARTH_BACKUP_KEEP, keeping the newest', async () => {
    process.env.HEARTH_BACKUP_KEEP = '2'
    const dir = join(tmp, 'backups')
    mkdirSync(dir, { recursive: true })
    // Older snapshots, named so they sort before anything runBackup writes now.
    for (const stamp of ['2000-01-01', '2000-01-02', '2000-01-03']) {
      writeFileSync(join(dir, `hearth-backup-${stamp}.json`), '{}')
    }

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    const { file } = await runBackup(db, ['household'])

    const left = readdirSync(dir).filter((f) => f.startsWith('hearth-backup-')).sort()
    expect(left.length).toBe(2)
    // The one we just wrote must survive, and the oldest must be gone.
    expect(left).toContain(basename(file))
    expect(left).not.toContain('hearth-backup-2000-01-01.json')
  })

  it('prunes the off-site copies to the same retention (#114)', async () => {
    const offsiteDir = join(tmp, 'offsite')
    mkdirSync(offsiteDir, { recursive: true })
    for (const stamp of ['2000-01-01', '2000-01-02', '2000-01-03']) {
      writeFileSync(join(offsiteDir, `hearth-backup-${stamp}.json.enc`), 'x')
    }
    process.env.HEARTH_BACKUP_KEEP = '2'
    process.env.HEARTH_BACKUP_OFFSITE = 'directory'
    process.env.HEARTH_BACKUP_DIR = offsiteDir
    process.env.HEARTH_BACKUP_PASSPHRASE = 'test-passphrase'

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    await runBackup(db, ['household'])

    const left = readdirSync(offsiteDir).sort()
    expect(left.length).toBe(2)
    expect(left).not.toContain('hearth-backup-2000-01-01.json.enc')
  })

  it('writes into HEARTH_BACKUP_LOCAL_DIR when set', async () => {
    const custom = join(tmp, 'elsewhere')
    process.env.HEARTH_BACKUP_LOCAL_DIR = custom

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    const { file } = await runBackup(db, ['household'])

    expect(dirname(file)).toBe(custom)
    expect(readdirSync(custom).filter((f) => f.startsWith('hearth-backup-')).length).toBe(1)
  })
})

describe('backupPrimary', () => {
  it('defaults to local', () => {
    expect(backupPrimary({})).toBe('local')
    expect(backupPrimary({ HEARTH_BACKUP_PRIMARY: '  LOCAL ' })).toBe('local')
  })

  it('reads offsite', () => {
    expect(backupPrimary({ HEARTH_BACKUP_PRIMARY: 'offsite' })).toBe('offsite')
  })

  // Unlike HEARTH_BACKUP_KEEP, a typo here can't fall back to a default: guessing
  // "local" would silently downgrade a hosted instance to backups it will lose.
  it('throws on an unknown value rather than guessing', () => {
    expect(() => backupPrimary({ HEARTH_BACKUP_PRIMARY: 'remote' })).toThrow(/HEARTH_BACKUP_PRIMARY/)
  })
})

describe('assertBackupConfig', () => {
  it('describes a plain local setup', () => {
    expect(assertBackupConfig({})).toMatch(/local .*backups \(primary\)/)
  })

  it('mentions the supplementary off-site target', () => {
    expect(
      assertBackupConfig({
        HEARTH_BACKUP_OFFSITE: 'directory',
        HEARTH_BACKUP_DIR: '/mnt/backup',
        HEARTH_BACKUP_PASSPHRASE: 'p',
      }),
    ).toMatch(/off-site copies to directory/)
  })

  it('refuses to boot when off-site is primary but not configured', () => {
    expect(() => assertBackupConfig({ HEARTH_BACKUP_PRIMARY: 'offsite' })).toThrow(/nowhere\s+durable/)
  })

  it('refuses to boot when off-site is primary but misconfigured', () => {
    expect(() =>
      assertBackupConfig({ HEARTH_BACKUP_PRIMARY: 'offsite', HEARTH_BACKUP_OFFSITE: 'directory' }),
    ).toThrow(/HEARTH_BACKUP_PASSPHRASE/)
  })

  it('warns that a write-only target has no restore or retention', () => {
    expect(
      assertBackupConfig({
        HEARTH_BACKUP_PRIMARY: 'offsite',
        HEARTH_BACKUP_OFFSITE: 'webhook',
        HEARTH_BACKUP_WEBHOOK_URL: 'https://example.test/b',
        HEARTH_BACKUP_PASSPHRASE: 'p',
      }),
    ).toMatch(/write-only/)
  })
})

// With the off-site copy promoted to primary (#114), a failed upload is a failed
// backup — the local file is on a disk the instance is assumed to be about to
// lose, so treating it as success is the bug this mode exists to prevent.
describe('runBackup — HEARTH_BACKUP_PRIMARY=offsite', () => {
  beforeEach(() => {
    process.env.HEARTH_BACKUP_PRIMARY = 'offsite'
    process.env.HEARTH_BACKUP_PASSPHRASE = 'test-passphrase'
  })

  it('stamps the household once the off-site copy has landed', async () => {
    const offsiteDir = join(tmp, 'offsite')
    process.env.HEARTH_BACKUP_OFFSITE = 'directory'
    process.env.HEARTH_BACKUP_DIR = offsiteDir

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    const { at, offsite } = await runBackup(db, ['household'])

    expect(offsite).toEqual({ kind: 'directory', ok: true })
    expect(readdirSync(offsiteDir).length).toBe(1)
    const [row] = await db.select().from(household).where(eq(household.id, 'household'))
    expect(row!.backupLastAt?.getTime()).toBe(at)
  })

  it('fails the backup and leaves the household due when the upload fails', async () => {
    process.env.HEARTH_BACKUP_OFFSITE = 'webhook'
    process.env.HEARTH_BACKUP_WEBHOOK_URL = 'https://example.test/backup'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500, statusText: 'err' })))

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    await expect(runBackup(db, ['household'])).rejects.toThrow(/off-site backup upload failed \(webhook\)/)

    // Not stamped, so the hourly tick retries instead of waiting a whole day.
    const [row] = await db.select().from(household).where(eq(household.id, 'household'))
    expect(row!.backupLastAt).toBeNull()
  })

  it('leaves older local snapshots alone when the upload fails', async () => {
    process.env.HEARTH_BACKUP_OFFSITE = 'webhook'
    process.env.HEARTH_BACKUP_WEBHOOK_URL = 'https://example.test/backup'
    process.env.HEARTH_BACKUP_KEEP = '1'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500, statusText: 'err' })))
    const dir = join(tmp, 'backups')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'hearth-backup-2000-01-01.json.enc'), '{}')

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    await expect(runBackup(db, ['household'])).rejects.toThrow()

    // The old copy may be the only good one left — pruning runs after the upload
    // for exactly this reason.
    expect(readdirSync(dir)).toContain('hearth-backup-2000-01-01.json.enc')
  })

  it('refuses to run at all when off-site backups are switched off', async () => {
    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')

    await expect(runBackup(db, ['household'])).rejects.toThrow(/HEARTH_BACKUP_OFFSITE/)
  })

  it('keeps only the newest local snapshot — it is staging, not the backup', async () => {
    process.env.HEARTH_BACKUP_OFFSITE = 'directory'
    process.env.HEARTH_BACKUP_DIR = join(tmp, 'offsite')
    process.env.HEARTH_BACKUP_KEEP = '14' // retention applies to the off-site store
    const dir = join(tmp, 'backups')
    mkdirSync(dir, { recursive: true })
    for (const stamp of ['2000-01-01', '2000-01-02']) {
      writeFileSync(join(dir, `hearth-backup-${stamp}.json.enc`), '{}')
    }

    const db = await makeTestDb()
    await addHousehold(db, 'household', 'daily')
    const { file } = await runBackup(db, ['household'])

    expect(readdirSync(dir)).toEqual([basename(file)])
  })
})
