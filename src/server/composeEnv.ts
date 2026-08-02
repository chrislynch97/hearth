/**
 * The `HEARTH_*` settings this image reads, and whether the environment it was
 * started with actually defines them (#241).
 *
 * The image and the compose file update independently, and only one of them
 * ever does: `docker compose pull && up -d` fetches a new image but leaves the
 * operator's compose file exactly as they first copied it. Every setting added
 * since then exists in the image and is never passed into the container, so
 * setting it in `.env` does nothing — silently. That is how a live instance
 * reported successful backups for weeks while nothing reached S3.
 *
 * It is detectable, because compose renders `${HEARTH_…:-}` as `HEARTH_…=` —
 * defined and empty — whereas a compose file that never mentions it leaves it
 * absent from the environment entirely. `name in env` tells those apart.
 */

/** Every `HEARTH_*` the server reads. Kept by hand because the running image
 *  has no TypeScript to scan; composeEnv.test.ts scans the source and fails if
 *  this list has drifted from it, so adding a setting without adding it here
 *  can't reach a release. */
export const SETTINGS: readonly string[] = [
  'HEARTH_ALERT_WEBHOOK',
  'HEARTH_ALLOWED_ORIGINS',
  'HEARTH_ALLOW_OPEN',
  'HEARTH_AUTH_ALERT_THRESHOLD',
  'HEARTH_BACKUP_DIR',
  'HEARTH_BACKUP_HEARTBEAT_URL',
  'HEARTH_BACKUP_KEEP',
  'HEARTH_BACKUP_LOCAL_DIR',
  'HEARTH_BACKUP_OFFSITE',
  'HEARTH_BACKUP_PASSPHRASE',
  'HEARTH_BACKUP_PRIMARY',
  'HEARTH_BACKUP_S3_ACCESS_KEY_ID',
  'HEARTH_BACKUP_S3_BUCKET',
  'HEARTH_BACKUP_S3_ENDPOINT',
  'HEARTH_BACKUP_S3_PREFIX',
  'HEARTH_BACKUP_S3_REGION',
  'HEARTH_BACKUP_S3_SECRET_ACCESS_KEY',
  'HEARTH_BACKUP_WEBHOOK_AUTH',
  'HEARTH_BACKUP_WEBHOOK_URL',
  'HEARTH_COMPOSE_FILE',
  'HEARTH_DEPLOY',
  'HEARTH_DISK_MIN_FREE_MB',
  'HEARTH_FEEDBACK_REPO',
  'HEARTH_FEEDBACK_TOKEN',
  'HEARTH_IMAGE',
  'HEARTH_MAIL_FROM',
  'HEARTH_MAIL_TRANSPORT',
  'HEARTH_PUBLIC',
  'HEARTH_PUBLIC_URL',
  'HEARTH_SECURE_COOKIES',
  'HEARTH_SMTP_HOST',
  'HEARTH_SMTP_PASS',
  'HEARTH_SMTP_PORT',
  'HEARTH_SMTP_TLS',
  'HEARTH_SMTP_USER',
  'HEARTH_TRUST_PROXY',
  'HEARTH_UPDATE_CHECK',
  'HEARTH_UPDATE_DIR',
  'HEARTH_UPDATE_TOKEN',
  'HEARTH_VERSION',
]

/** Settings a shipped compose file deliberately doesn't pass through, and why.
 *  Their absence is by design rather than drift, so the check below never
 *  reports them — which does mean a compose file too old to know about one of
 *  these can't be spotted from it. Each entry is a name some compose file omits
 *  on purpose; composeEnv.test.ts fails if the two lists disagree. */
export const UNREPORTED: Record<string, string> = {
  HEARTH_ALLOW_OPEN: 'docker-compose.public.yml omits it so a LAN .env value cannot reach a public box',
  HEARTH_DEPLOY: 'set by the compose file itself; the source-build files omit it on purpose',
  HEARTH_IMAGE: 'set by the Dockerfile, so no compose file passes it in',
  HEARTH_VERSION: 'baked into the image at build time',
}

/** Whether we're running the official Docker image, which is the only place
 *  compose drift can happen. The marker comes from the Dockerfile, not from a
 *  compose file, so it's exactly as current as the settings list above — a
 *  stale compose file can't switch the check off. Bare-Node and dev runs define
 *  no `HEARTH_*` at all and would otherwise report all of them as missing. */
export function isImageDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HEARTH_IMAGE === '1'
}

/** Settings this image reads that the environment doesn't define at all — i.e.
 *  ones the compose file never mentions, so `.env` cannot reach them. Empty on
 *  anything but the Docker image (see `isImageDeploy`). */
export function missingComposeSettings(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isImageDeploy(env)) return []
  return SETTINGS.filter((name) => !(name in UNREPORTED) && !(name in env))
}

/** The operator-facing explanation, or null when nothing is missing. Names the
 *  remedy, not just the variables: the list on its own reads like a feature
 *  list, and the fix — re-copy the compose file — isn't guessable from it. */
export function composeDriftWarning(missing: string[]): string | null {
  if (missing.length === 0) return null
  return (
    `${missing.length} setting${missing.length === 1 ? ' is' : 's are'} not passed in by your ` +
    `compose file, so ${missing.length === 1 ? 'it' : 'they'} cannot be set from .env: ` +
    `${missing.join(', ')}. Your compose file is older than this image — updating the image does ` +
    'not update the compose file. Re-copy it from the release you are running, keeping any changes ' +
    'you made to it, then `docker compose up -d`.'
  )
}
