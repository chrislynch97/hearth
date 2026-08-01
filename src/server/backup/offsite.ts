import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { join } from 'node:path'
import { decryptSnapshot, encryptSnapshot } from './encrypt'

// Off-site backup target (#39, #114). Local backups sit on the same volume as the
// database, so a lost or corrupted data volume takes the DB and every backup with
// it — and on a hosted container with no durable disk, "the same volume" means
// "gone at the next deploy". Once a snapshot has been written and verified
// locally, an *encrypted* copy is pushed to a second location: a different
// disk/mount, an object store, or an outbound endpoint.
//
// Off by default: a self-hoster on a trusted LAN with good local backups may not
// want it. Enabled and configured entirely through environment variables so it
// needs no schema or UI, and stays out of the way of the LAN-only default.
//
// `HEARTH_BACKUP_PRIMARY=offsite` (see runner.ts) promotes the off-site copy from
// a supplementary nice-to-have to *the* backup — see that file for what changes.

export type OffsiteKind = 'webhook' | 'directory' | 's3'

/** One stored backup object. `at` is the target's own last-modified time (ms),
 *  which is what the restore UI shows — the filename stamp says the same thing,
 *  but the target's clock is the one that survives a rename. */
export interface OffsiteEntry {
  name: string
  size: number
  at: number
}

export interface OffsiteTarget {
  readonly kind: OffsiteKind
  /** Push one encrypted snapshot. `name` is a filesystem-safe object key ending
   *  in `.json.enc`; `data` is the ciphertext. Rejects on failure. */
  upload(name: string, data: Buffer): Promise<void>
}

/** A target that can also be enumerated, read back and pruned. This is what
 *  remote retention and in-app restore need, and it's why `webhook` can't have
 *  them: a POST-only endpoint has no verb to list or delete with, so its
 *  retention is the receiving service's job (an S3 lifecycle rule, say). */
export interface ReadableOffsiteTarget extends OffsiteTarget {
  list(): Promise<OffsiteEntry[]>
  fetch(name: string): Promise<Buffer>
  remove(name: string): Promise<void>
}

export function isReadable(target: OffsiteTarget): target is ReadableOffsiteTarget {
  return typeof (target as Partial<ReadableOffsiteTarget>).list === 'function'
}

export interface OffsiteConfig {
  target: OffsiteTarget
  passphrase: string
}

/** The shape of every name we write. Object keys come back *from* the target and
 *  are then handed to `fetch`/`remove` across a tRPC call, so they are untrusted
 *  input by the time they're used — never a path or URL fragment to interpolate
 *  blindly. Anything that isn't a name we could have written is refused. */
const NAME_RE = /^hearth-backup-[A-Za-z0-9._-]+\.json\.enc$/

export function assertObjectName(name: string): void {
  if (!NAME_RE.test(name)) throw new Error(`refusing to use "${name}" as a backup object name`)
}

/** POST the ciphertext to an outbound webhook — a receiving service, a home-grown
 *  collector, or an object-store gateway. The body is the raw encrypted bytes; the
 *  original filename travels in an `X-Hearth-Backup` header, and an optional
 *  Authorization header is sent verbatim. Write-only: prefer the `s3` target when
 *  you want retention and in-app restore. */
class WebhookTarget implements OffsiteTarget {
  readonly kind = 'webhook'
  constructor(
    private readonly url: string,
    private readonly auth: string | undefined,
  ) {}

  async upload(name: string, data: Buffer): Promise<void> {
    assertObjectName(name)
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
      'x-hearth-backup': name,
    }
    if (this.auth) headers.authorization = this.auth
    // Node's fetch accepts a Buffer body at runtime; the cast bridges the DOM
    // `BodyInit` type, which (under TS's generic Uint8Array) doesn't admit it.
    const res = await fetch(this.url, { method: 'POST', headers, body: data as unknown as BodyInit })
    if (!res.ok) throw new Error(`off-site webhook returned ${res.status} ${res.statusText}`)
  }
}

/** Copy the ciphertext to a second directory — intended to be a *different*
 *  physical volume (a second disk, or an NFS/CIFS/rsync mount), so the copy
 *  survives the primary data volume dying. Written durably and atomically (temp
 *  file + fsync + rename), matching the local backup writer, so a crash mid-copy
 *  never leaves a truncated file that looks complete. Owner-only (0600), since it
 *  is still an encrypted secret-bearing file. */
class DirectoryTarget implements ReadableOffsiteTarget {
  readonly kind = 'directory'
  constructor(private readonly dir: string) {}

  async upload(name: string, data: Buffer): Promise<void> {
    assertObjectName(name)
    mkdirSync(this.dir, { recursive: true })
    const file = join(this.dir, name)
    const tmp = `${file}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, data)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, file)
  }

  async list(): Promise<OffsiteEntry[]> {
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch {
      return [] // nothing written yet — an empty target, not an error
    }
    return names
      .filter((name) => NAME_RE.test(name))
      .map((name) => {
        const stat = statSync(join(this.dir, name))
        return { name, size: stat.size, at: stat.mtimeMs }
      })
  }

  async fetch(name: string): Promise<Buffer> {
    assertObjectName(name)
    return readFileSync(join(this.dir, name))
  }

  async remove(name: string): Promise<void> {
    assertObjectName(name)
    rmSync(join(this.dir, name), { force: true })
  }
}

// --- S3-compatible object storage -------------------------------------------
//
// Signed with AWS Signature V4 over plain `fetch` rather than pulling in the AWS
// SDK: three verbs and a list is a small, stable surface, and the SDK is tens of
// megabytes of dependency for a self-hosted budgeting app. Works against AWS S3,
// Cloudflare R2, Backblaze B2, MinIO and anything else speaking the same API.

const ALGORITHM = 'AWS4-HMAC-SHA256'
const SERVICE = 's3'

interface S3Options {
  origin: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  prefix: string
  /** Bucket in the hostname (`bucket.s3.region.amazonaws.com`) rather than in the
   *  path. Inferred from the endpoint, so AWS and MinIO both work unconfigured. */
  virtualHosted: boolean
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

/** RFC 3986 percent-encoding, which is what SigV4's canonical request wants.
 *  `encodeURIComponent` leaves `!'()*` alone; S3 does not. */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Encode a path segment-wise, so the separators survive but the segments are
 *  escaped. The result is both the request path and the canonical URI — building
 *  the URL from the already-encoded form is what stops it being encoded twice. */
function encodePath(path: string): string {
  return path.split('/').map(uriEncode).join('/')
}

function encodeQuery(query: ReadonlyArray<readonly [string, string]>): string {
  return [...query]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join('&')
}

/** Pull one XML element's text out of an S3 response. The response shape is fixed
 *  and the values we read (keys, sizes, timestamps, continuation tokens) are all
 *  ASCII, so a parser dependency would buy nothing here. */
function xmlTag(xml: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1]
}

class S3Target implements ReadableOffsiteTarget {
  readonly kind = 's3'
  constructor(private readonly opts: S3Options) {}

  async upload(name: string, data: Buffer): Promise<void> {
    assertObjectName(name)
    await this.request('PUT', this.objectPath(name), [], data)
  }

  async list(): Promise<OffsiteEntry[]> {
    const entries: OffsiteEntry[] = []
    let token: string | undefined
    // Paginate: a bucket that has accumulated more than a page of objects would
    // otherwise silently list — and prune against — only the first 1000.
    do {
      const query: Array<[string, string]> = [
        ['list-type', '2'],
        ['prefix', this.opts.prefix],
      ]
      if (token) query.push(['continuation-token', token])
      const xml = await (await this.request('GET', this.bucketPath(), query)).text()
      for (const chunk of xml.split('<Contents>').slice(1)) {
        const key = xmlTag(chunk, 'Key')
        if (key === undefined || !key.startsWith(this.opts.prefix)) continue
        const name = key.slice(this.opts.prefix.length)
        if (!NAME_RE.test(name)) continue
        entries.push({
          name,
          size: Number(xmlTag(chunk, 'Size') ?? 0),
          at: Date.parse(xmlTag(chunk, 'LastModified') ?? '') || 0,
        })
      }
      token = xmlTag(xml, 'IsTruncated') === 'true' ? xmlTag(xml, 'NextContinuationToken') : undefined
    } while (token)
    return entries
  }

  async fetch(name: string): Promise<Buffer> {
    assertObjectName(name)
    const res = await this.request('GET', this.objectPath(name))
    return Buffer.from(await res.arrayBuffer())
  }

  async remove(name: string): Promise<void> {
    assertObjectName(name)
    await this.request('DELETE', this.objectPath(name))
  }

  private bucketPath(): string {
    return this.opts.virtualHosted ? '/' : `/${this.opts.bucket}/`
  }

  private objectPath(name: string): string {
    const base = this.opts.virtualHosted ? '' : `/${this.opts.bucket}`
    return `${base}/${this.opts.prefix}${name}`
  }

  private async request(
    method: string,
    path: string,
    query: ReadonlyArray<readonly [string, string]> = [],
    body?: Buffer,
  ): Promise<Response> {
    const encodedPath = encodePath(path)
    const queryString = encodeQuery(query)
    const url = `${this.opts.origin}${encodedPath}${queryString ? `?${queryString}` : ''}`
    const headers = this.sign(method, new URL(url).host, encodedPath, queryString, body)
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : (body as unknown as BodyInit),
    })
    if (!res.ok) {
      // S3 errors carry a <Message> worth surfacing (SignatureDoesNotMatch,
      // NoSuchBucket, AccessDenied) — a bare status leaves the operator guessing.
      const detail = xmlTag(await res.text().catch(() => ''), 'Message')
      throw new Error(`S3 ${method} returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
    }
    return res
  }

  private sign(
    method: string,
    host: string,
    encodedPath: string,
    queryString: string,
    body: Buffer | undefined,
  ): Record<string, string> {
    const payloadHash = sha256Hex(body ?? '')
    const amzDate = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
    const dateStamp = amzDate.slice(0, 8)

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }
    const signedHeaders = Object.keys(headers).sort()
    const canonicalHeaders = signedHeaders.map((k) => `${k}:${headers[k]!.trim()}\n`).join('')
    const canonicalRequest = [
      method,
      encodedPath,
      queryString,
      canonicalHeaders,
      signedHeaders.join(';'),
      payloadHash,
    ].join('\n')

    const scope = `${dateStamp}/${this.opts.region}/${SERVICE}/aws4_request`
    const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.opts.secretAccessKey}`, dateStamp), this.opts.region), SERVICE),
      'aws4_request',
    )
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')

    headers.authorization =
      `${ALGORITHM} Credential=${this.opts.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`
    // Added after signing on purpose: it isn't in SignedHeaders, so signing it
    // would make the signature disagree with what the server recomputes.
    if (body !== undefined) headers['content-type'] = 'application/octet-stream'
    return headers
  }
}

function required(env: NodeJS.ProcessEnv, name: string, mode: string): string {
  const value = (env[name] ?? '').trim()
  if (value.length === 0) throw new Error(`HEARTH_BACKUP_OFFSITE=${mode} requires ${name}`)
  return value
}

function resolveS3(env: NodeJS.ProcessEnv): S3Target {
  const endpoint = required(env, 'HEARTH_BACKUP_S3_ENDPOINT', 's3')
  const bucket = required(env, 'HEARTH_BACKUP_S3_BUCKET', 's3')
  let origin: string
  let virtualHosted: boolean
  try {
    const url = new URL(endpoint)
    origin = url.origin
    // AWS wants the bucket in the hostname for new buckets; MinIO and friends
    // want it in the path. Rather than a second knob, read it off the endpoint:
    // point at `https://<bucket>.s3.<region>.amazonaws.com` and we sign
    // virtual-hosted, at `https://minio.example.com` and we sign path-style.
    virtualHosted = url.hostname.startsWith(`${bucket}.`)
  } catch {
    throw new Error(`HEARTH_BACKUP_S3_ENDPOINT is not a valid URL: "${endpoint}"`)
  }

  // A prefix is a key namespace, not a path — no traversal, no leading slash.
  const rawPrefix = (env.HEARTH_BACKUP_S3_PREFIX ?? '').trim().replace(/^\/+/, '')
  if (rawPrefix !== '' && !/^[A-Za-z0-9._/-]+$/.test(rawPrefix)) {
    throw new Error('HEARTH_BACKUP_S3_PREFIX may only contain letters, digits, dot, dash, underscore and slash')
  }
  const prefix = rawPrefix === '' ? '' : `${rawPrefix.replace(/\/+$/, '')}/`

  return new S3Target({
    origin,
    bucket,
    // us-east-1 is the signing region that S3-compatible services which don't
    // care about regions (MinIO) accept; Cloudflare R2 wants "auto".
    region: (env.HEARTH_BACKUP_S3_REGION ?? '').trim() || 'us-east-1',
    accessKeyId: required(env, 'HEARTH_BACKUP_S3_ACCESS_KEY_ID', 's3'),
    secretAccessKey: required(env, 'HEARTH_BACKUP_S3_SECRET_ACCESS_KEY', 's3'),
    prefix,
    virtualHosted,
  })
}

/** Read the off-site backup configuration from the environment. Returns `null`
 *  when off-site backups are off (the default). Throws when they are enabled but
 *  misconfigured — a missing passphrase, URL, bucket or directory — so a broken
 *  config is reported rather than silently skipping the off-site copy.
 *
 *  Env vars:
 *    HEARTH_BACKUP_OFFSITE       off (default) | webhook | directory | s3
 *    HEARTH_BACKUP_PASSPHRASE    encryption passphrase (required when enabled)
 *    HEARTH_BACKUP_WEBHOOK_URL   webhook mode: endpoint to POST the ciphertext to
 *    HEARTH_BACKUP_WEBHOOK_AUTH  webhook mode: optional Authorization header value
 *    HEARTH_BACKUP_DIR           directory mode: second-volume path to copy into
 *    HEARTH_BACKUP_S3_ENDPOINT   s3 mode: service origin (bucket-in-host ⇒ virtual-hosted)
 *    HEARTH_BACKUP_S3_BUCKET     s3 mode: bucket name
 *    HEARTH_BACKUP_S3_REGION     s3 mode: signing region (default us-east-1)
 *    HEARTH_BACKUP_S3_ACCESS_KEY_ID / _SECRET_ACCESS_KEY   s3 mode: credentials
 *    HEARTH_BACKUP_S3_PREFIX     s3 mode: optional key prefix
 */
export function resolveOffsiteConfig(env: NodeJS.ProcessEnv = process.env): OffsiteConfig | null {
  const mode = (env.HEARTH_BACKUP_OFFSITE ?? '').trim().toLowerCase()
  if (mode === '' || mode === 'off') return null

  const passphrase = env.HEARTH_BACKUP_PASSPHRASE ?? ''
  if (passphrase.length === 0) {
    throw new Error(
      'HEARTH_BACKUP_OFFSITE is set but HEARTH_BACKUP_PASSPHRASE is empty — off-site backups ' +
        'must be encrypted (the snapshot holds password hashes and MFA secrets).',
    )
  }

  if (mode === 'webhook') {
    const url = required(env, 'HEARTH_BACKUP_WEBHOOK_URL', 'webhook')
    const auth = env.HEARTH_BACKUP_WEBHOOK_AUTH?.trim() || undefined
    return { target: new WebhookTarget(url, auth), passphrase }
  }
  if (mode === 'directory') {
    return { target: new DirectoryTarget(required(env, 'HEARTH_BACKUP_DIR', 'directory')), passphrase }
  }
  if (mode === 's3') {
    return { target: resolveS3(env), passphrase }
  }
  throw new Error(`unknown HEARTH_BACKUP_OFFSITE mode "${mode}" (expected off, webhook, directory, or s3)`)
}

/** Encrypt `snapshotJson` with the configured passphrase and push it off-site
 *  under `name` (a `…json.enc` object key). Rejects if encryption or upload fails. */
export async function uploadOffsite(config: OffsiteConfig, name: string, snapshotJson: string): Promise<void> {
  const ciphertext = encryptSnapshot(snapshotJson, config.passphrase)
  await config.target.upload(name, ciphertext)
}

/** Pull one off-site backup back and decrypt it to snapshot JSON — the read half
 *  of {@link uploadOffsite}, used by the in-app restore. Throws when the target
 *  is write-only, the object is missing, or the passphrase doesn't match. */
export async function downloadOffsite(config: OffsiteConfig, name: string): Promise<string> {
  if (!isReadable(config.target)) {
    throw new Error(`the ${config.target.kind} off-site target is write-only, so backups can't be read back from it`)
  }
  return decryptSnapshot(await config.target.fetch(name), config.passphrase)
}

/** Newest-first listing of what's stored off-site, or `null` when the target
 *  can't be enumerated. Sorted by name: the timestamp is in the filename, so it
 *  orders correctly without trusting the target's clock. */
export async function listOffsite(config: OffsiteConfig): Promise<OffsiteEntry[] | null> {
  if (!isReadable(config.target)) return null
  const entries = await config.target.list()
  return entries.sort((a, b) => b.name.localeCompare(a.name))
}
