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

/** Origins the operator has explicitly declared safe, from HEARTH_ALLOWED_ORIGINS
 *  (comma-separated, e.g. `https://hearth.example.com,http://192.168.1.10:8787`).
 *  Only needed when something in front rewrites the Host header so it no longer
 *  matches the origin the browser actually used; the default same-host comparison
 *  covers the ordinary deployments. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.HEARTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/** The `host:port` of an origin, or null if it isn't a parseable absolute URL.
 *  Comparison is on host, not scheme: a TLS-terminating proxy legitimately sends
 *  `Origin: https://…` while the Host header behind it describes a plain-HTTP
 *  hop, and rejecting that would break the common reverse-proxy deployment. */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host || null
  } catch {
    return null
  }
}

/** Whether a state-changing request's `Origin` is acceptable (issue #50).
 *
 * A second, independent layer behind `SameSite=Lax`. Lax already stops a
 * cross-site POST from carrying the session cookie, and is sound for tRPC's JSON
 * POSTs in a current browser — but the cookie is not `Secure` on a plain-HTTP LAN
 * deployment, and "the browser is current and implements Lax the way we assume"
 * is the entire guarantee. This costs one header comparison and doesn't share
 * that assumption.
 *
 * A missing Origin is allowed: browsers attach one to every cross-site POST and
 * to every `fetch`, so its absence means the caller isn't a browser doing the
 * thing we're defending against (curl, a script, a health check). Rejecting it
 * would break non-browser clients to stop an attack that shape of request can't
 * mount — the request forgery we care about needs a browser with a cookie jar.
 *
 * `null` (an opaque origin — a sandboxed iframe, a redirect that stripped it) is
 * NOT treated as missing: it's a real browser deliberately withholding, so it
 * falls through to the host comparison and fails.
 */
export function isAllowedOrigin(opts: {
  origin: string | undefined
  host: string | undefined
  allowed?: string[]
}): boolean {
  if (opts.origin === undefined) return true
  if ((opts.allowed ?? []).includes(opts.origin)) return true
  const from = originHost(opts.origin)
  return from !== null && from === opts.host
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
