/** Session cookie (de)serialization — no external dependency.
 *  Not marked Secure so it works over plain HTTP for self-hosting; the spec
 *  recommends fronting the app with a reverse proxy / Tailscale when exposed. */

import { SESSION_IDLE_TTL_MS } from './session'

export const SESSION_COOKIE = 'hearth_session'
// Mirror the server-side idle window (issue #50): the cookie should go stale at
// the same moment the row does, so the browser stops presenting a token the
// server would only reject. The server remains the authority — a cookie kept
// alive past its Max-Age still resolves against the row's real deadlines.
const DEFAULT_MAX_AGE_SECONDS = Math.floor(SESSION_IDLE_TTL_MS / 1000)

export function parseSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === SESSION_COOKIE) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/** Serialize the session cookie; pass `null` to clear it. Adds `Secure` when
 *  served over HTTPS so the cookie isn't sent in cleartext. `maxAgeSeconds`
 *  overrides the default idle window — the sliding-expiry path passes the row's
 *  real remaining life, which near the absolute ceiling is shorter than the idle
 *  TTL. Clamped to at least 1s: a computed 0 would read as "delete this cookie". */
export function serializeSessionCookie(
  token: string | null,
  secure = false,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): string {
  let cookie = `${SESSION_COOKIE}=${token === null ? '' : encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/`
  if (secure) cookie += '; Secure'
  cookie += token === null ? '; Max-Age=0' : `; Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`
  return cookie
}
