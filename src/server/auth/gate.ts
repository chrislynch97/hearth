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
