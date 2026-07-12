/** Pure helpers for the coarse HTTP auth gate (index.ts). Kept dependency-free
 *  and side-effect-free so they can be unit-tested without booting the server
 *  (importing index.ts would run `main()` and start listening). */

/** Hosts that only accept connections from the same machine. Binding to one of
 *  these means an open instance isn't actually reachable from the network, so the
 *  open-on-public guard doesn't apply. */
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host)
}

/** The open-on-public guard's runtime config, read from the process environment.
 *  Shared by the HTTP gate (index.ts) and `auth.status` so the client can be told
 *  it needs a first-run password screen without the two layers drifting on how
 *  "reachable off-box" and "operator opted in" are computed. Defaults mirror
 *  index.ts's HOST/HEARTH_ALLOW_OPEN handling. */
export function openGuardConfig(env: NodeJS.ProcessEnv = process.env): {
  bindIsLoopback: boolean
  allowOpen: boolean
} {
  return {
    bindIsLoopback: isLoopbackHost(env.HOST ?? '0.0.0.0'),
    allowOpen: env.HEARTH_ALLOW_OPEN === '1',
  }
}

/** True when the instance is open (no owner password) AND reachable off-box AND
 *  the operator hasn't opted into open access — the "bricked first-run" state the
 *  UI must break out of with a set-owner-password gate (#34). In that state the
 *  HTTP gate 403s everything but the `OPEN_ON_PUBLIC_ALLOWED` auth endpoints. */
export function isOpenAccessBlocked(opts: {
  locked: boolean
  bindIsLoopback: boolean
  allowOpen: boolean
}): boolean {
  return !opts.locked && !opts.bindIsLoopback && !opts.allowOpen
}

/** The tRPC procedure path(s) a `/trpc/...` URL targets. tRPC batches
 *  comma-separate them in the path segment and percent-encode the dots, so we
 *  strip the prefix + query string, split on commas and decode each — mirroring
 *  the Fastify adapter's own parsing. */
export function trpcProcedures(url: string): string[] {
  const path = url.slice('/trpc/'.length).split('?')[0] ?? ''
  return path.split(',').map((p) => decodeURIComponent(p))
}

/** True only when EVERY procedure in the (possibly batched) request is allowed.
 *  Fails closed: an empty list, or a batch mixing an allowed and a disallowed
 *  procedure, is not allowed. */
export function allProceduresIn(procedures: string[], allowed: Set<string>): boolean {
  return procedures.length > 0 && procedures.every((p) => allowed.has(p))
}
