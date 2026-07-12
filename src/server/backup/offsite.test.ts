import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveOffsiteConfig, uploadOffsite } from './offsite'
import { decryptSnapshot } from './encrypt'

const PASS = 'a-strong-passphrase'

describe('resolveOffsiteConfig', () => {
  it('returns null when unset or explicitly off', () => {
    expect(resolveOffsiteConfig({})).toBeNull()
    expect(resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: 'off' })).toBeNull()
    expect(resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: '  OFF ' })).toBeNull()
  })

  it('throws when enabled without a passphrase (secrets must be encrypted)', () => {
    expect(() => resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: 'directory', HEARTH_BACKUP_DIR: '/x' })).toThrow(
      /HEARTH_BACKUP_PASSPHRASE/,
    )
  })

  it('throws on a webhook target with no URL', () => {
    expect(() =>
      resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: 'webhook', HEARTH_BACKUP_PASSPHRASE: PASS }),
    ).toThrow(/HEARTH_BACKUP_WEBHOOK_URL/)
  })

  it('throws on a directory target with no dir', () => {
    expect(() =>
      resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: 'directory', HEARTH_BACKUP_PASSPHRASE: PASS }),
    ).toThrow(/HEARTH_BACKUP_DIR/)
  })

  it('throws on an unknown mode', () => {
    expect(() => resolveOffsiteConfig({ HEARTH_BACKUP_OFFSITE: 'ftp', HEARTH_BACKUP_PASSPHRASE: PASS })).toThrow(
      /unknown HEARTH_BACKUP_OFFSITE mode/,
    )
  })

  it('builds a webhook target', () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'webhook',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_WEBHOOK_URL: 'https://example.test/backup',
    })
    expect(config?.target.kind).toBe('webhook')
  })

  it('builds a directory target', () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: '/some/dir',
    })
    expect(config?.target.kind).toBe('directory')
  })
})

describe('uploadOffsite — directory target', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hearth-offsite-test-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes an encrypted copy that decrypts back to the snapshot JSON', async () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: dir,
    })!
    const json = JSON.stringify({ version: 1, tables: { household: [{ id: 'h' }] } })

    await uploadOffsite(config, 'hearth-backup-2026.json.enc', json)

    const files = readdirSync(dir)
    expect(files).toEqual(['hearth-backup-2026.json.enc'])
    // The on-disk copy is ciphertext, not the plaintext JSON...
    const bytes = readFileSync(join(dir, files[0]!))
    expect(bytes.includes(Buffer.from('household'))).toBe(false)
    // ...and decrypts back to exactly what went in.
    expect(decryptSnapshot(bytes, PASS)).toBe(json)
  })

  it('leaves no stray .tmp file', async () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: dir,
    })!
    await uploadOffsite(config, 'x.json.enc', '{}')
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('writes the copy owner-only (0600)', async () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: dir,
    })!
    await uploadOffsite(config, 'x.json.enc', '{}')
    expect(statSync(join(dir, 'x.json.enc')).mode & 0o777).toBe(0o600)
  })
})

describe('uploadOffsite — webhook target', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs the encrypted bytes with the auth + name headers', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'webhook',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_WEBHOOK_URL: 'https://example.test/backup',
      HEARTH_BACKUP_WEBHOOK_AUTH: 'Bearer secret-token',
    })!
    const json = JSON.stringify({ tables: {} })

    await uploadOffsite(config, 'hearth-backup.json.enc', json)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/backup')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-token')
    expect(headers['x-hearth-backup']).toBe('hearth-backup.json.enc')
    // Body is the ciphertext, and it decrypts back to the JSON.
    expect(decryptSnapshot(Buffer.from(init.body as unknown as Uint8Array), PASS)).toBe(json)
  })

  it('throws when the webhook responds non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' })))
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'webhook',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_WEBHOOK_URL: 'https://example.test/backup',
    })!
    await expect(uploadOffsite(config, 'x.json.enc', '{}')).rejects.toThrow(/500/)
  })
})
