/** Session cookie (de)serialization — no external dependency.
 *  Not marked Secure so it works over plain HTTP for self-hosting; the spec
 *  recommends fronting the app with a reverse proxy / Tailscale when exposed. */

export const SESSION_COOKIE = 'hearth_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

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
 *  served over HTTPS so the cookie isn't sent in cleartext. */
export function serializeSessionCookie(token: string | null, secure = false): string {
  let cookie = `${SESSION_COOKIE}=${token === null ? '' : encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/`
  if (secure) cookie += '; Secure'
  cookie += token === null ? '; Max-Age=0' : `; Max-Age=${MAX_AGE_SECONDS}`
  return cookie
}
