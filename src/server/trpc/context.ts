import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { DB } from '../db/client'
import { db } from '../db/client'
import { membership } from '../db/schema'
import type { Session } from '../db/schema'
import { parseSessionCookie, serializeSessionCookie } from '../auth/cookies'
import { getOwnerUser, getValidSession, isInstanceLocked, touchSession } from '../auth/session'
import { parseTrustProxy } from '../auth/trustProxy'
import type { SessionOrigin } from '../auth/session'
import { DEFAULT_HOUSEHOLD_ID } from './tenant'
import type { StagedAudit } from './audit'

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
  /** Where a session created by this request would be coming from (user agent +
   *  IP), recorded on the row so `sessions.list` can describe it (issue #50). */
  sessionOrigin?: SessionOrigin
  /** Client identifier (IP) for rate limiting. */
  clientKey?: string
  /** Set (or clear, with `null`) the session cookie on the response. `maxAgeSeconds`
   *  defaults to the idle window; the sliding-expiry path passes the session's real
   *  remaining life. */
  setSessionCookie?: (token: string | null, maxAgeSeconds?: number) => void
  /** Per-request buffer of audit-log entries a mutation resolver has staged via
   *  `recordAudit`; flushed to `audit_log` by the audit middleware on success. */
  auditEntries?: StagedAudit[]
}

/** Whether this request reached us over HTTPS, deciding only the cookie's `Secure`
 *  flag today (#54).
 *
 *  `x-forwarded-proto` is a client-settable header: it means something only when a
 *  proxy we trust set it, so it is honoured only when `HEARTH_TRUST_PROXY` is
 *  configured — the same switch that decides whether we believe that proxy's
 *  `X-Forwarded-For`. Getting this wrong is currently harmless (the worst case is
 *  a `Secure` cookie on a plain-HTTP instance, which fails safe by not being sent),
 *  but the header must not be trusted by default in case this is ever reused for a
 *  decision where it isn't. */
function isHttps(req: CreateFastifyContextOptions['req'] | undefined): boolean {
  if (process.env.HEARTH_SECURE_COOKIES === '1') return true
  if (req?.protocol === 'https') return true
  const trustsProxy = parseTrustProxy(process.env.HEARTH_TRUST_PROXY) !== false
  return trustsProxy && req?.headers['x-forwarded-proto'] === 'https'
}

/**
 * Resolve who this request is and which household it acts on. A valid session
 * cookie wins; otherwise we fall back to the default household's owner so an
 * open (password-less) local instance keeps working with no login.
 *
 * The owner fallback is gated on the instance being open: on a LOCKED instance
 * an unauthenticated request resolves to an anonymous context (no userId/role)
 * and fails closed in-resolver. Previously the fallback fired regardless, and
 * only the outer HTTP gate stopped an anonymous caller from being handed owner
 * identity — so any gate regression escalated straight to owner takeover.
 */
export async function resolveIdentity(
  database: DB,
  sessionToken: string | undefined,
  preresolvedSession: Session | null | undefined,
): Promise<{ userId?: string; householdId: string; sessionId?: string; role?: string; session?: Session }> {
  let userId: string | undefined
  let householdId = DEFAULT_HOUSEHOLD_ID
  let sessionId: string | undefined

  // Reuse the gate's already-validated session when present; otherwise go through
  // getValidSession (not a hand-rolled query) so the session-validity rules stay
  // in one place and can't drift from the HTTP auth gate.
  const s = preresolvedSession !== undefined ? preresolvedSession : await getValidSession(database, sessionToken)
  if (s) {
    userId = s.userId
    householdId = s.activeHouseholdId
    sessionId = s.id
  }

  if (!userId && !(await isInstanceLocked(database))) {
    // Open/local fallback: the instance owner, so a password-less instance works
    // with no login. Only applied when the instance is OPEN — a locked instance
    // must never hand owner identity to an unauthenticated request (defence in
    // depth behind the HTTP gate). Resolve it through getOwnerUser (accepted
    // `owner` grant, deterministically ordered) rather than "first membership in
    // the default household" — the latter had no role/acceptedAt filter and no
    // ORDER BY, so ambient identity could resolve to a viewer or an unaccepted
    // invitee, and could flip after a row reorder.
    const owner = await getOwnerUser(database)
    userId = owner?.id
    householdId = DEFAULT_HOUSEHOLD_ID
  }

  let role: string | undefined
  if (userId) {
    const [m] = await database
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

  return { userId, householdId, sessionId, role, session: s ?? undefined }
}

export async function createContext(opts?: CreateFastifyContextOptions): Promise<Context> {
  const req = opts?.req
  const res = opts?.res
  const secure = isHttps(req)
  const sessionToken = parseSessionCookie(req?.headers.cookie)
  const preresolved = req ? validatedSessionByRequest.get(req) : undefined
  const identity = await resolveIdentity(db, sessionToken, preresolved)

  const setSessionCookie = res
    ? (token: string | null, maxAgeSeconds?: number) => {
        void res.header('set-cookie', serializeSessionCookie(token, secure, maxAgeSeconds))
      }
    : undefined

  // Sliding expiry (issue #50): using the app keeps the session alive. Done here
  // rather than in `getValidSession` so the write happens once per request, and
  // only when the row is actually stale enough to be worth one. When the window
  // moves, re-issue the cookie with the row's real remaining life so browser and
  // server agree on when it dies.
  if (identity.session && sessionToken) {
    const expiresAt = await touchSession(db, identity.session)
    if (expiresAt) setSessionCookie?.(sessionToken, (expiresAt.getTime() - Date.now()) / 1000)
  }

  return {
    db,
    householdId: identity.householdId,
    userId: identity.userId,
    role: identity.role,
    sessionId: identity.sessionId,
    sessionToken,
    sessionOrigin: { userAgent: req?.headers['user-agent'] ?? null, ip: req?.ip ?? null },
    clientKey: req?.ip,
    auditEntries: [],
    setSessionCookie,
  }
}
