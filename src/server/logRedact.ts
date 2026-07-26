/** Strip bearer tokens out of a URL before it reaches the request log.
 *
 *  Invite tokens are live credentials for 7 days, and Fastify's default request
 *  serializer writes `req.url` verbatim — so `GET /invite/<token>` or a tRPC
 *  query carrying `{"token":"…"}` in `?input=` puts a usable credential into a
 *  plaintext log, which has a different audience and retention policy than the
 *  database (#176).
 *
 *  Invite links now carry the token in the URL fragment and `invitations.info`
 *  is a mutation, so neither shape should reach us any more. This is the
 *  backstop: it covers links sent under the old format (valid for 7 more days)
 *  and any future procedure that takes a token in a query input.
 *
 *  It only cleans Hearth's own log. A reverse proxy in front logs the URL it
 *  received — see the public-deployment notes in docs/deployment.md.
 */

const REDACTED = '[redacted]'

// The legacy invite link format: `/invite/<token>`, up to the next `?` or `#`.
const INVITE_PATH = /^(\/invite\/)[^?#]+/

// A `"token":"…"` pair in a query string, raw or percent-encoded — tRPC's
// httpBatchLink sends query input as URL-encoded JSON. Tokens are hex, so the
// value class can't run past the closing quote and swallow the rest of the URL.
const TOKEN_INPUT = /((?:"|%22)token(?:"|%22)(?::|%3A)(?:"|%22))[A-Za-z0-9._~-]+/gi

export function redactUrl(url: string): string {
  return url.replace(INVITE_PATH, `$1${REDACTED}`).replace(TOKEN_INPUT, `$1${REDACTED}`)
}
