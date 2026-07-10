import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import { db } from '../db/client'
import { membership } from '../db/schema'
import type { Session } from '../db/schema'
import { parseSessionCookie, serializeSessionCookie } from '../auth/cookies'
import { getOwnerUser, getValidSession } from '../auth/session'
import { DEFAULT_HOUSEHOLD_ID } from './tenant'

// The HTTP auth gate (index.ts) already validates the session for locked,
// authenticated requests. Stash that result keyed by the request object so
// createContext reuses it instead of re-querying the same row (one session
// lookup per request instead of two). A WeakMap avoids leaking finished requests.
const validatedSessionByRequest = new WeakMap<object, Session | null>()

/** Called by the HTTP gate once it has validated (or rejected) a session, so the
 *  tRPC context for the same request doesn't repeat the lookup. */
export function rememberValidatedSession(req: object, session: Session | null): void {
  validatedSessionByRequest.set(req, session)
}

export interface Context {
  db: DB
  /** The household this request operates on. Tenant-scoped queries key on it. */
  householdId: string
  /** The authenticated (or, on an open instance, the resolved owner) user id. */
  userId?: string
  /** The current user's role in the active household ('owner'|'admin'|'member'|'viewer'). */
  role?: string
  /** The active session's id, when the request carries a valid session cookie. */
  sessionId?: string
  /** Raw session-cookie value from the request, if any. */
  sessionToken?: string
  /** Client identifier (IP) for rate limiting. */
  clientKey?: string
  /** Set (or clear, with `null`) the session cookie on the response. */
  setSessionCookie?: (token: string | null) => void
}

function isHttps(req: CreateFastifyContextOptions['req'] | undefined): boolean {
  if (process.env.HEARTH_SECURE_COOKIES === '1') return true
  return req?.headers['x-forwarded-proto'] === 'https' || req?.protocol === 'https'
}

/**
 * Resolve who this request is and which household it acts on. A valid session
 * cookie wins; otherwise we fall back to the default household's owner so an
 * open (password-less) local instance keeps working with no login. On a locked
 * instance the HTTP gate rejects unauthenticated requests before they reach a
 * tenant-scoped procedure, so this fallback identity is only actually used when
 * the instance is open.
 */
async function resolveIdentity(
  sessionToken: string | undefined,
  preresolvedSession: Session | null | undefined,
): Promise<{ userId?: string; householdId: string; sessionId?: string; role?: string }> {
  let userId: string | undefined
  let householdId = DEFAULT_HOUSEHOLD_ID
  let sessionId: string | undefined

  // Reuse the gate's already-validated session when present; otherwise go through
  // getValidSession (not a hand-rolled query) so the session-validity rules stay
  // in one place and can't drift from the HTTP auth gate.
  const s = preresolvedSession !== undefined ? preresolvedSession : await getValidSession(db, sessionToken)
  if (s) {
    userId = s.userId
    householdId = s.activeHouseholdId
    sessionId = s.id
  }

  if (!userId) {
    // Open/local fallback: the instance owner, so a password-less instance works
    // with no login. Resolve it through getOwnerUser (accepted `owner` grant,
    // deterministically ordered) rather than "first membership in the default
    // household" — the latter had no role/acceptedAt filter and no ORDER BY, so
    // ambient identity could resolve to a viewer or an unaccepted invitee, and
    // could flip after a row reorder.
    const owner = await getOwnerUser(db)
    userId = owner?.id
    householdId = DEFAULT_HOUSEHOLD_ID
  }

  let role: string | undefined
  if (userId) {
    const [m] = await db
      .select()
      .from(membership)
      // Only accepted memberships grant a role — defence in depth against a
      // hand-crafted snapshot import planting an unaccepted membership row.
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.householdId, householdId),
          isNotNull(membership.acceptedAt),
        ),
      )
    role = m?.role
  }

  return { userId, householdId, sessionId, role }
}

export async function createContext(opts?: CreateFastifyContextOptions): Promise<Context> {
  const req = opts?.req
  const res = opts?.res
  const secure = isHttps(req)
  const sessionToken = parseSessionCookie(req?.headers.cookie)
  const preresolved = req ? validatedSessionByRequest.get(req) : undefined
  const identity = await resolveIdentity(sessionToken, preresolved)
  return {
    db,
    householdId: identity.householdId,
    userId: identity.userId,
    role: identity.role,
    sessionId: identity.sessionId,
    sessionToken,
    clientKey: req?.ip,
    setSessionCookie: res
      ? (token) => {
          void res.header('set-cookie', serializeSessionCookie(token, secure))
        }
      : undefined,
  }
}
