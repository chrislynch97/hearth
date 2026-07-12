import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { encryptSnapshot } from './encrypt'

// Off-site backup target (#39). Local backups sit on the same volume as the
// database, so a lost or corrupted data volume takes the DB and every backup with
// it. Once a snapshot has been written and verified locally, we optionally push an
// *encrypted* copy to a second location — a different disk/mount, or an outbound
// endpoint — so there is a copy that survives the primary volume dying.
//
// Off by default: a self-hoster on a trusted LAN with good local backups may not
// want it. Enabled and configured entirely through environment variables so it
// needs no schema or UI, and stays out of the way of the LAN-only default.

export type OffsiteKind = 'webhook' | 'directory'

export interface OffsiteTarget {
  readonly kind: OffsiteKind
  /** Push one encrypted snapshot. `name` is a filesystem-safe object key ending
   *  in `.json.enc`; `data` is the ciphertext. Rejects on failure. */
  upload(name: string, data: Buffer): Promise<void>
}

export interface OffsiteConfig {
  target: OffsiteTarget
  passphrase: string
}

/** POST the ciphertext to an outbound webhook — a receiving service, a home-grown
 *  collector, or an object-store gateway. (For S3-compatible storage, point this
 *  at a presigned PUT URL and set method via that URL's contract; the generic POST
 *  covers most collectors.) The body is the raw encrypted bytes; the original
 *  filename travels in an `X-Hearth-Backup` header, and an optional Authorization
 *  header is sent verbatim. */
class WebhookTarget implements OffsiteTarget {
  readonly kind = 'webhook'
  constructor(
    private readonly url: string,
    private readonly auth: string | undefined,
  ) {}

  async upload(name: string, data: Buffer): Promise<void> {
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
class DirectoryTarget implements OffsiteTarget {
  readonly kind = 'directory'
  constructor(private readonly dir: string) {}

  async upload(name: string, data: Buffer): Promise<void> {
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
}

/** Read the off-site backup configuration from the environment. Returns `null`
 *  when off-site backups are off (the default). Throws when they are enabled but
 *  misconfigured — a missing passphrase, URL, or directory — so a broken config
 *  is reported rather than silently skipping the off-site copy.
 *
 *  Env vars:
 *    HEARTH_BACKUP_OFFSITE       off (default) | webhook | directory
 *    HEARTH_BACKUP_PASSPHRASE    encryption passphrase (required when enabled)
 *    HEARTH_BACKUP_WEBHOOK_URL   webhook mode: endpoint to POST the ciphertext to
 *    HEARTH_BACKUP_WEBHOOK_AUTH  webhook mode: optional Authorization header value
 *    HEARTH_BACKUP_DIR           directory mode: second-volume path to copy into
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
    const url = (env.HEARTH_BACKUP_WEBHOOK_URL ?? '').trim()
    if (url.length === 0) throw new Error('HEARTH_BACKUP_OFFSITE=webhook requires HEARTH_BACKUP_WEBHOOK_URL')
    const auth = env.HEARTH_BACKUP_WEBHOOK_AUTH?.trim() || undefined
    return { target: new WebhookTarget(url, auth), passphrase }
  }
  if (mode === 'directory') {
    const dir = (env.HEARTH_BACKUP_DIR ?? '').trim()
    if (dir.length === 0) throw new Error('HEARTH_BACKUP_OFFSITE=directory requires HEARTH_BACKUP_DIR')
    return { target: new DirectoryTarget(dir), passphrase }
  }
  throw new Error(`unknown HEARTH_BACKUP_OFFSITE mode "${mode}" (expected off, webhook, or directory)`)
}

/** Encrypt `snapshotJson` with the configured passphrase and push it off-site
 *  under `name` (a `…json.enc` object key). Rejects if encryption or upload fails. */
export async function uploadOffsite(config: OffsiteConfig, name: string, snapshotJson: string): Promise<void> {
  const ciphertext = encryptSnapshot(snapshotJson, config.passphrase)
  await config.target.upload(name, ciphertext)
}
