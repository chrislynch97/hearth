/** Building and reading the invite URL.
 *
 *  The token lives in the URL *fragment*. Browsers never send a fragment to the
 *  server, so a 7-day invite credential never reaches Hearth's request log or a
 *  reverse proxy's access log — both of which record full URLs by default and
 *  both of which have a wider audience than the database (#176).
 */

export const inviteLink = (origin: string, token: string) =>
    `${origin}/invite#${token}`;

/** A malformed `%` escape would otherwise throw and blank the whole app, so fall
 *  back to the raw text and let the server reject it as an unknown token. */
const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/** The token from the current location, or `null` if this isn't an invite URL.
 *  Returns `""` for an invite URL with no token, so the accept screen can say
 *  the link is invalid rather than falling through to the login gate. */
export const readInviteToken = ({
    pathname,
    hash,
}: Pick<Location, "pathname" | "hash">): string | null => {
    if (pathname !== "/invite" && !pathname.startsWith("/invite/")) return null;
    // Legacy links carried the token as a path segment; still honoured because
    // one sent before the switch stays valid for up to 7 days.
    const raw = hash.replace(/^#/, "") || pathname.slice("/invite/".length);

    return safeDecode(raw);
};
