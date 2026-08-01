import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertObjectName,
  downloadOffsite,
  isReadable,
  listOffsite,
  resolveOffsiteConfig,
  uploadOffsite,
  type OffsiteConfig,
  type ReadableOffsiteTarget,
} from './offsite'
import { decryptSnapshot, encryptSnapshot } from './encrypt'

const PASS = 'a-strong-passphrase'
const NAME = 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc'

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

describe('uploadOffsite â€” directory target', () => {
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

    await uploadOffsite(config, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc', json)

    const files = readdirSync(dir)
    expect(files).toEqual(['hearth-backup-2026-01-01T00-00-00-000Z.json.enc'])
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
    await uploadOffsite(config, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc', '{}')
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('writes the copy owner-only (0600)', async () => {
    const config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: dir,
    })!
    await uploadOffsite(config, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc', '{}')
    expect(statSync(join(dir, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc')).mode & 0o777).toBe(0o600)
  })
})

describe('uploadOffsite â€” webhook target', () => {
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

    await uploadOffsite(config, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc', json)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/backup')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-token')
    expect(headers['x-hearth-backup']).toBe('hearth-backup-2026-01-01T00-00-00-000Z.json.enc')
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
    await expect(uploadOffsite(config, 'hearth-backup-2026-01-01T00-00-00-000Z.json.enc', '{}')).rejects.toThrow(/500/)
  })
})

describe('assertObjectName', () => {
  it('accepts the names the runner writes', () => {
    expect(() => assertObjectName(NAME)).not.toThrow()
  })

  // The name arrives back from the target and then travels through a tRPC call
  // before being used as a path or URL, so traversal must never survive it.
  it('rejects traversal, separators and anything not shaped like a backup', () => {
    for (const bad of [
      '../../etc/passwd',
      'hearth-backup-../../etc/passwd.json.enc',
      'hearth-backup-x/y.json.enc',
      'hearth-backup-x.json',
      'notabackup.json.enc',
      '',
    ]) {
      expect(() => assertObjectName(bad)).toThrow(/refusing to use/)
    }
  })
})

describe('directory target — read back', () => {
  let dir: string
  let config: OffsiteConfig

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hearth-offsite-read-'))
    config = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: dir,
    })!
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists what was uploaded, newest first, ignoring foreign files', async () => {
    await uploadOffsite(config, 'hearth-backup-2026-01-01.json.enc', '{}')
    await uploadOffsite(config, 'hearth-backup-2026-02-01.json.enc', '{}')
    writeFileSync(join(dir, 'notes.txt'), 'not a backup')

    const entries = await listOffsite(config)

    expect(entries!.map((e) => e.name)).toEqual([
      'hearth-backup-2026-02-01.json.enc',
      'hearth-backup-2026-01-01.json.enc',
    ])
    expect(entries!.every((e) => e.size > 0)).toBe(true)
  })

  it('returns an empty list for a target directory that does not exist yet', async () => {
    const missing = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: PASS,
      HEARTH_BACKUP_DIR: join(dir, 'nope'),
    })!
    expect(await listOffsite(missing)).toEqual([])
  })

  it('round-trips a snapshot back through downloadOffsite', async () => {
    const json = JSON.stringify({ version: 1, tables: { household: [{ id: 'h' }] } })
    await uploadOffsite(config, NAME, json)

    expect(await downloadOffsite(config, NAME)).toBe(json)
  })

  it('refuses to decrypt with the wrong passphrase', async () => {
    await uploadOffsite(config, NAME, '{}')
    const wrong = resolveOffsiteConfig({
      HEARTH_BACKUP_OFFSITE: 'directory',
      HEARTH_BACKUP_PASSPHRASE: 'not-the-passphrase',
      HEARTH_BACKUP_DIR: dir,
    })!

    await expect(downloadOffsite(wrong, NAME)).rejects.toThrow(/wrong passphrase/)
  })

  it('removes an object', async () => {
    await uploadOffsite(config, NAME, '{}')
    await (config.target as ReadableOffsiteTarget).remove(NAME)

    expect(await listOffsite(config)).toEqual([])
  })
})

describe('webhook target — write-only', () => {
  const config = resolveOffsiteConfig({
    HEARTH_BACKUP_OFFSITE: 'webhook',
    HEARTH_BACKUP_PASSPHRASE: PASS,
    HEARTH_BACKUP_WEBHOOK_URL: 'https://example.test/backup',
  })!

  it('is not readable, so there is nothing to list', async () => {
    expect(isReadable(config.target)).toBe(false)
    expect(await listOffsite(config)).toBeNull()
  })

  it('explains why a restore is impossible rather than failing obscurely', async () => {
    await expect(downloadOffsite(config, NAME)).rejects.toThrow(/write-only/)
  })
})

describe('s3 target — configuration', () => {
  const base = {
    HEARTH_BACKUP_OFFSITE: 's3',
    HEARTH_BACKUP_PASSPHRASE: PASS,
    HEARTH_BACKUP_S3_BUCKET: 'hearth-backups',
    HEARTH_BACKUP_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
    HEARTH_BACKUP_S3_SECRET_ACCESS_KEY: 'secret',
  }

  it('builds a readable target', () => {
    const config = resolveOffsiteConfig({ ...base, HEARTH_BACKUP_S3_ENDPOINT: 'https://minio.test' })!
    expect(config.target.kind).toBe('s3')
    expect(isReadable(config.target)).toBe(true)
  })

  it('names the missing variable rather than failing vaguely', () => {
    expect(() => resolveOffsiteConfig({ ...base, HEARTH_BACKUP_S3_ENDPOINT: '' })).toThrow(
      /HEARTH_BACKUP_S3_ENDPOINT/,
    )
    expect(() =>
      resolveOffsiteConfig({
        ...base,
        HEARTH_BACKUP_S3_BUCKET: '',
        HEARTH_BACKUP_S3_ENDPOINT: 'https://minio.test',
      }),
    ).toThrow(/HEARTH_BACKUP_S3_BUCKET/)
    expect(() =>
      resolveOffsiteConfig({
        ...base,
        HEARTH_BACKUP_S3_SECRET_ACCESS_KEY: '',
        HEARTH_BACKUP_S3_ENDPOINT: 'https://minio.test',
      }),
    ).toThrow(/HEARTH_BACKUP_S3_SECRET_ACCESS_KEY/)
  })

  it('rejects a non-URL endpoint', () => {
    expect(() => resolveOffsiteConfig({ ...base, HEARTH_BACKUP_S3_ENDPOINT: 'minio.test' })).toThrow(/not a valid URL/)
  })

  it('rejects a prefix that could escape the key namespace', () => {
    expect(() =>
      resolveOffsiteConfig({
        ...base,
        HEARTH_BACKUP_S3_ENDPOINT: 'https://minio.test',
        HEARTH_BACKUP_S3_PREFIX: 'a?b=c',
      }),
    ).toThrow(/HEARTH_BACKUP_S3_PREFIX/)
  })
})

describe('s3 target — requests', () => {
  const s3Env = (extra: Record<string, string> = {}) => ({
    HEARTH_BACKUP_OFFSITE: 's3',
    HEARTH_BACKUP_PASSPHRASE: PASS,
    HEARTH_BACKUP_S3_ENDPOINT: 'https://minio.test',
    HEARTH_BACKUP_S3_BUCKET: 'hearth-backups',
    HEARTH_BACKUP_S3_REGION: 'eu-west-2',
    HEARTH_BACKUP_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
    HEARTH_BACKUP_S3_SECRET_ACCESS_KEY: 'secret',
    ...extra,
  })

  const stubFetch = (impl: (url: string, init: RequestInit) => Response) => {
    const mock = vi.fn(async (url: string, init: RequestInit) => impl(url, init))
    vi.stubGlobal('fetch', mock)
    return mock
  }

  const listXml = (keys: string[], truncated = false, token?: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${keys
      .map((k) => `<Contents><Key>${k}</Key><Size>128</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>`)
      .join('')}<IsTruncated>${truncated}</IsTruncated>${
      token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ''
    }</ListBucketResult>`

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('PUTs the ciphertext path-style and signs it with SigV4', async () => {
    const mock = stubFetch(() => new Response(null, { status: 200 }))
    const config = resolveOffsiteConfig(s3Env({ HEARTH_BACKUP_S3_PREFIX: 'instance-one' }))!

    await uploadOffsite(config, NAME, '{"tables":{}}')

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://minio.test/hearth-backups/instance-one/${NAME}`)
    expect(init.method).toBe('PUT')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/eu-west-2\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
    // The signed payload hash must be the hash of the bytes actually sent, or S3
    // rejects the request — this is the pairing that's easy to get wrong.
    const body = Buffer.from(init.body as unknown as Uint8Array)
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(body).digest('hex'))
    expect(decryptSnapshot(body, PASS)).toBe('{"tables":{}}')
  })

  it('puts the bucket in the host when the endpoint already does', async () => {
    const mock = stubFetch(() => new Response(null, { status: 200 }))
    const config = resolveOffsiteConfig(
      s3Env({ HEARTH_BACKUP_S3_ENDPOINT: 'https://hearth-backups.s3.eu-west-2.amazonaws.com' }),
    )!

    await uploadOffsite(config, NAME, '{}')

    const [url] = mock.mock.calls[0] as unknown as [string]
    expect(url).toBe(`https://hearth-backups.s3.eu-west-2.amazonaws.com/${NAME}`)
  })

  it('lists across pages and ignores keys that are not ours', async () => {
    const pages = [
      listXml(['hearth-backup-2026-01-01.json.enc', 'someone-elses-file.txt'], true, 'page2'),
      listXml(['hearth-backup-2026-02-01.json.enc']),
    ]
    let call = 0
    const mock = stubFetch(() => new Response(pages[call++]!, { status: 200 }))
    const config = resolveOffsiteConfig(s3Env())!

    const entries = await listOffsite(config)

    expect(mock).toHaveBeenCalledTimes(2)
    expect(entries!.map((e) => e.name)).toEqual([
      'hearth-backup-2026-02-01.json.enc',
      'hearth-backup-2026-01-01.json.enc',
    ])
    expect(entries![0]!.size).toBe(128)
    // Second page must carry the continuation token, or listing loops forever.
    const [secondUrl] = mock.mock.calls[1] as unknown as [string]
    expect(secondUrl).toContain('continuation-token=page2')
  })

  it('surfaces the S3 error message rather than a bare status', async () => {
    stubFetch(
      () =>
        new Response('<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated…</Message></Error>', {
          status: 403,
          statusText: 'Forbidden',
        }),
    )
    const config = resolveOffsiteConfig(s3Env())!

    await expect(uploadOffsite(config, NAME, '{}')).rejects.toThrow(/403.*The request signature/)
  })

  it('fetches and decrypts an object back', async () => {
    const ciphertext = encryptSnapshot('{"tables":{}}', PASS)
    stubFetch(() => new Response(new Uint8Array(ciphertext), { status: 200 }))
    const config = resolveOffsiteConfig(s3Env())!

    expect(await downloadOffsite(config, NAME)).toBe('{"tables":{}}')
  })

  it('deletes an object', async () => {
    const mock = stubFetch(() => new Response(null, { status: 204 }))
    const config = resolveOffsiteConfig(s3Env())!

    await (config.target as ReadableOffsiteTarget).remove(NAME)

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://minio.test/hearth-backups/${NAME}`)
    expect(init.method).toBe('DELETE')
  })
})
