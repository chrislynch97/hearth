/** Upper bounds on user-supplied text fields accepted by the public, pre-auth
 *  tRPC endpoints (auth.login/register, invitations.accept/info). The global
 *  Fastify bodyLimit is 64 MB so a large JSON export can be restored, but that
 *  limit applies to every route — including these unauthenticated ones. Without
 *  per-field caps an attacker could POST megabytes of "username"/"password" and
 *  make the server do proportional work (scrypt cost scales with password
 *  length). These caps are generous for real input but keep each field bounded.
 *
 *  Password length has its own cap in password-policy.ts (MAX_PASSWORD_LENGTH),
 *  shared with the strength check. */

/** Usernames, display names, household names. */
export const MAX_NAME_LENGTH = 100

/** MFA codes: a 6-digit TOTP, or a formatted recovery code with spaces/dashes. */
export const MAX_CODE_LENGTH = 100

/** Invitation tokens are 64 hex chars (a 32-byte session id); allow headroom. */
export const MAX_TOKEN_LENGTH = 200

/** Email addresses. RFC 5321 caps a path at 254 octets; nothing real is longer,
 *  and the reset endpoint takes one unauthenticated. */
export const MAX_EMAIL_LENGTH = 254
