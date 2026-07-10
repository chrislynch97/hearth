import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { db } from '../db/client'
import { membership, session } from '../db/schema'
import { parseSessionCookie, serializeSessionCookie } from '../auth/cookies'
import { getOwnerUser } from '../auth/session'
import { DEFAULT_HOUSEHOLD_ID } from './tenant'

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
): Promise<{ userId?: string; householdId: string; sessionId?: string; role?: string }> {
  let userId: string | undefined
  let householdId = DEFAULT_HOUSEHOLD_ID
  let sessionId: string | undefined

  if (sessionToken) {
    const [s] = await db.select().from(session).where(eq(session.id, sessionToken))
    if (s && s.expiresAt > Date.now()) {
      userId = s.userId
      householdId = s.activeHouseholdId
      sessionId = s.id
    }
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
      .where(and(eq(membership.userId, userId), eq(membership.householdId, householdId)))
    role = m?.role
  }

  return { userId, householdId, sessionId, role }
}

export async function createContext(opts?: CreateFastifyContextOptions): Promise<Context> {
  const req = opts?.req
  const res = opts?.res
  const secure = isHttps(req)
  const sessionToken = parseSessionCookie(req?.headers.cookie)
  const identity = await resolveIdentity(sessionToken)
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
