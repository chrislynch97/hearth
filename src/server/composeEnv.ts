/**
 * Whether the compose file this container was started with is older than the
 * image expects (#241, reworked in hearth-planning#31).
 *
 * Shipped compose files pass `.env` straight into the app with `env_file`, so a
 * setting added in a later release reaches the app without any compose change.
 * What a compose file can still fall behind on is its structure — a new
 * service, volume or port — and, for installs that predate `env_file`, the
 * switch to it. Each shipped file stamps `HEARTH_COMPOSE_VERSION` in its
 * `environment:`; bump `COMPOSE_VERSION` and every stamp together when a
 * release changes that structure, so installs still on the old file are told.
 */

/** The compose layout this image expects. composeEnv.test.ts fails if a shipped
 *  compose file's stamp disagrees. */
export const COMPOSE_VERSION = 1

/** Whether we're running the Docker image, the only place a compose file is in
 *  play. The marker comes from the Dockerfile, so a stale compose file can't
 *  switch the check off. */
export function isImageDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HEARTH_IMAGE === '1'
}

/** True when the compose file's stamp is missing or older than this image's.
 *  A missing stamp is a compose file from before `env_file`, which lists each
 *  setting by hand. */
export function composeOutdated(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isImageDeploy(env)) return false
  const stamp = Number.parseInt(env.HEARTH_COMPOSE_VERSION ?? '', 10)
  return !(stamp >= COMPOSE_VERSION)
}

/** The startup log line, or null when the compose file is current. */
export function composeOutdatedWarning(outdated: boolean): string | null {
  if (!outdated) return null
  return (
    'Your compose file is older than this version of Hearth. Settings in .env may not reach the app ' +
    'until it is replaced with the one from this release: keep your changes in .env or a ' +
    'compose.override.yml, replace the file, then `docker compose up -d`. With the host updater ' +
    'installed, later updates refresh it for you. See docs/deployment.md → Updating.'
  )
}
