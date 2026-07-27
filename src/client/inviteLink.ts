/** Reading the token out of a token-bearing URL.
 *
 *  The links themselves are built in `@shared/links`, shared with the server so
 *  the link an admin copies and the one Hearth emails can't drift apart. All of
 *  them put the token in the URL *fragment*: browsers never send a fragment to
 *  the server, so a live credential never reaches Hearth's request log or a
 *  reverse proxy's access log — both of which record full URLs by default and
 *  both of which have a wider audience than the database (#176).
 */

import { TOKEN_ROUTES, type TokenRoute } from "@shared/links";

export { inviteLink } from "@shared/links";

/** A malformed `%` escape would otherwise throw and blank the whole app, so fall
 *  back to the raw text and let the server reject it as an unknown token. */
const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/** The token from the current location for one route, or `null` if this isn't
 *  that route's URL. Returns `""` for the route with no token, so the screen can
 *  say the link is invalid rather than falling through to the login gate.
 *
 *  `legacyPathSegment` also reads `<path>/<token>`, for invite links sent before
 *  the switch to fragments — one stays valid for up to 7 days. */
const readToken = (
    { pathname, hash }: Pick<Location, "pathname" | "hash">,
    route: TokenRoute,
    legacyPathSegment = false
): string | null => {
    const path = TOKEN_ROUTES[route];
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return null;
    const fragment = hash.replace(/^#/, "");
    const raw =
        fragment || (legacyPathSegment ? pathname.slice(path.length + 1) : "");

    return safeDecode(raw);
};

export const readInviteToken = (
    location: Pick<Location, "pathname" | "hash">
) => readToken(location, "invite", true);

/** The token from `/verify-email#<token>`, or `null` elsewhere. */
export const readVerifyEmailToken = (
    location: Pick<Location, "pathname" | "hash">
) => readToken(location, "verifyEmail");

/** The token from `/reset-password#<token>`, or `null` elsewhere. */
export const readResetPasswordToken = (
    location: Pick<Location, "pathname" | "hash">
) => readToken(location, "resetPassword");
