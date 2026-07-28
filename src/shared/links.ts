/** URLs that carry a bearer token, built in one place so the copied link and the
 *  emailed link can never drift apart.
 *
 *  Every token lives in the URL *fragment*. Browsers never send a fragment to the
 *  server, so an invite / verification / reset credential never reaches Hearth's
 *  request log or a reverse proxy's access log — both of which record full URLs
 *  by default and both of which have a wider audience than the database (#176).
 *
 *  Kept free of any Node or browser API so it bundles cleanly on both sides.
 */

/** The token-bearing screens, keyed by the path they live at. */
export const TOKEN_ROUTES = {
  invite: '/invite',
  verifyEmail: '/verify-email',
  resetPassword: '/reset-password',
} as const

export type TokenRoute = keyof typeof TOKEN_ROUTES

/** Absolute link to a token-bearing screen. `origin` is a scheme + host with no
 *  trailing slash (`https://hearth.example.com`). */
export function tokenLink(origin: string, route: TokenRoute, token: string): string {
  return `${origin.replace(/\/+$/, '')}${TOKEN_ROUTES[route]}#${token}`
}

export const inviteLink = (origin: string, token: string) => tokenLink(origin, 'invite', token)
export const verifyEmailLink = (origin: string, token: string) => tokenLink(origin, 'verifyEmail', token)
export const resetPasswordLink = (origin: string, token: string) => tokenLink(origin, 'resetPassword', token)
