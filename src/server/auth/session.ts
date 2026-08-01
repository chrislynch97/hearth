/** Server-side sessions. The cookie holds a session id; a request is
 *  authenticated when that id resolves to a live (unexpired) session row.
 *  Replaces the old stateless HMAC(password) token so sessions can carry user
 *  identity and be revoked (logout, password change, "sign out everywhere"). */
import { and, asc, eq, isNotNull, lt, ne, or } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import type { DB, DBOrTx } from '../db/client'
import { hashToken, newBearerToken } from './bearer'
import { SchedulerLock, withLeaderLock } from '../db/leader'
import { membership, session, user } from '../db/schema'
import type { Session, User } from '../db/schema'
import { getInstanceSettings, setAuthRequired, setInstanceOwnerId } from '../db/instanceSettings'
import { DEFAULT_HOUSEHOLD_ID, ROLE_RANK, type Role } from '../trpc/tenant'
import { deleteExpiredEmailTokens } from '../mail/tokens'
import { newId } from '../../shared/ids'

/** Idle window. A session dies this long after its last use, not after its
 *  creation — `touchSession` slides it forward while you keep using the app. The
 *  point is that a cookie an attacker stole and then sat on goes cold on its own. */
export const SESSION_IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

/** Hard ceiling on a session's total life, fixed at creation and never moved.
 *  Without it a sliding window renews forever, so a stolen cookie that is kept
 *  warm never expires. This forces everyone back through the login screen (and
 *  MFA) periodically, however active they are. */
export const SESSION_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

/** How stale `lastSeenAt` may get before a request slides the window forward.
 *  Renewing on *every* request would add a write to every authenticated call for
 *  no security gain; an hour's granularity is invisible against a 14-day window. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/** Create a new user and their accepted membership of a household in one shot.
 *  Shared by self-registration and invite acceptance (which differ only in the
 *  email, role and whether an invite predates the account). Returns the user id.
 *  The password is passed pre-hashed so callers control the (async) hashing.
 *
 *  Accepts a transaction handle (`DBOrTx`): both callers run it inside a
 *  `db.transaction` so the user and membership inserts commit together — a
 *  failure between them would otherwise orphan a user with no membership. */
export async function createUserWithMembership(
  db: DBOrTx,
  opts: {
    username: string
    displayName: string
    email: string | null
    passwordHash: string
    householdId: string
    role: string
    invitedAt?: Date
  },
): Promise<string> {
  const now = new Date()
  const userId = newId()
  await db.insert(user).values({
    id: userId,
    username: opts.username,
    email: opts.email,
    displayName: opts.displayName,
    passwordHash: opts.passwordHash,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(membership).values({
    id: newId(),
    userId,
    householdId: opts.householdId,
    role: opts.role,
    invitedAt: opts.invitedAt ?? null,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  return userId
}

/** Where a session was established. Recorded so `sessions.list` can show a user
 *  something recognisable ("Firefox on Windows, from 192.168.1.9") rather than an
 *  opaque row they can't judge. Both are client-controlled hints, never trusted
 *  for any decision. */
export interface SessionOrigin {
  userAgent?: string | null
  ip?: string | null
}

// A user-agent header is attacker-controlled and unbounded; it's only ever
// displayed, but store a sane slice rather than whatever arrives.
const MAX_USER_AGENT_LENGTH = 400

/** Create a session for a user's active household; returns the cookie value (the
 *  raw token). Only its hash is persisted as the row id. */
export async function createSession(
  db: DB,
  userId: string,
  householdId: string,
  origin: SessionOrigin = {},
): Promise<string> {
  const token = newBearerToken()
  const now = new Date()
  await db
    .insert(session)
    .values({
      id: hashToken(token),
      userId,
      activeHouseholdId: householdId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_TTL_MS),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
      userAgent: origin.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
      ip: origin.ip ?? null,
    })
  return token
}

/** Whether a session row is still live: both its idle window and its absolute
 *  ceiling must still be in the future. Either one lapsing kills it. */
export function isSessionLive(s: Session, now: number = Date.now()): boolean {
  return s.expiresAt.getTime() > now && s.absoluteExpiresAt.getTime() > now
}

/** The live session for a cookie value, or null if missing/unknown/expired. The
 *  presented token is hashed before lookup — rows are keyed by hash, not token. */
export async function getValidSession(db: DB, token: string | undefined): Promise<Session | null> {
  if (!token) return null
  const [s] = await db.select().from(session).where(eq(session.id, hashToken(token)))
  return s && isSessionLive(s) ? s : null
}

/** When a session's idle window next lapses, given activity at `now`: `now` + the
 *  idle TTL, but never past the absolute ceiling — the cap always wins. */
export function slidExpiry(s: Session, now: number = Date.now()): Date {
  return new Date(Math.min(now + SESSION_IDLE_TTL_MS, s.absoluteExpiresAt.getTime()))
}

/** Slide a session's idle window forward because it was just used, if enough time
 *  has passed to be worth a write (SESSION_TOUCH_INTERVAL_MS). Returns the row's
 *  new deadline when it moved, or null when the touch was skipped — callers use
 *  that to decide whether to re-issue the cookie with a matching Max-Age.
 *
 *  Best-effort: a failure here means the window didn't slide (the session stays
 *  valid until its existing deadline), which must never fail the user's request. */
export async function touchSession(db: DB, s: Session, now: number = Date.now()): Promise<Date | null> {
  if (now - s.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return null
  const expiresAt = slidExpiry(s, now)
  try {
    await db
      .update(session)
      .set({ lastSeenAt: new Date(now), expiresAt })
      .where(eq(session.id, s.id))
    return expiresAt
  } catch (err) {
    console.error('[auth] failed to slide session expiry', err)
    return null
  }
}

/** A user's live sessions, most recently active first. Returns whole rows; the
 *  router is responsible for never shipping the id (a token hash) to a client. */
export async function listUserSessions(db: DB, userId: string): Promise<Session[]> {
  const rows = await db.select().from(session).where(eq(session.userId, userId))
  return rows.filter((s) => isSessionLive(s)).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
}

/** Revoke one session by its row id, scoped to its owner so a caller can only
 *  ever end their own. Returns whether a row actually went away. */
export async function deleteUserSessionById(db: DB, userId: string, sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(session)
    .where(and(eq(session.userId, userId), eq(session.id, sessionId)))
    .returning({ id: session.id })
  return deleted.length > 0
}

/** Revoke every session for a user EXCEPT the one given — "sign out everywhere
 *  else", which must not log the person doing it out of the device they're on.
 *  Returns how many were ended. */
export async function deleteOtherUserSessions(db: DB, userId: string, keepSessionId: string): Promise<number> {
  const deleted = await db
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.id, keepSessionId)))
    .returning({ id: session.id })
  return deleted.length
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.delete(session).where(eq(session.id, hashToken(token)))
}

/** Revoke every session for a user (used on password change / clear). */
export async function deleteUserSessions(db: DB, userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId))
}

const PURGE_INTERVAL_MS = 60 * 60 * 1000 // hourly; expiry is 30 days, so timing is not sensitive

/** Delete every session that has hit either deadline — its idle window or its
 *  absolute ceiling. `getValidSession` ignores dead rows at read time, so this
 *  only reclaims storage — but without it the `session` table grows forever on a
 *  long-running instance (one dead row per login, kept indefinitely). */
export async function deleteExpiredSessions(db: DB, now: Date = new Date()): Promise<void> {
  await db.delete(session).where(or(lt(session.expiresAt, now), lt(session.absoluteExpiresAt, now)))
}

/** Start the periodic purge of expired sessions and spent email tokens. Mirrors
 *  the backup scheduler: an unref'd interval that never keeps the process alive
 *  on its own, running an immediate first sweep so a fresh boot doesn't wait an
 *  hour to clear a backlog. Leader-guarded (#113) so only one replica sweeps per
 *  tick — the two tables are swept together because they expire on the same
 *  order of timescale and neither is worth its own scheduler. */
export function startSessionPurgeScheduler(db: DB): void {
  const tick = async () => {
    try {
      await withLeaderLock(db, SchedulerLock.sessionPurge, async () => {
        await deleteExpiredSessions(db)
        await deleteExpiredEmailTokens(db)
      })
    } catch (err) {
      console.error('Expired-session purge failed:', err)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), PURGE_INTERVAL_MS)
  timer.unref?.() // don't keep the process alive just for the purge
}

/** Derive the instance operator from the primary household's owner grant — the
 *  fallback used before an explicit owner id has been stored (legacy installs),
 *  and the source `ensureSeed` backfills that id from. Filters to an *accepted*
 *  `owner` grant and orders deterministically so the result can't silently drift
 *  when rows are reordered (e.g. by a VACUUM) or when several rows match. */
async function deriveOwnerUser(db: DB): Promise<User | null> {
  const [grant] = await db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.householdId, DEFAULT_HOUSEHOLD_ID),
        eq(membership.role, 'owner'),
        isNotNull(membership.acceptedAt),
      ),
    )
    .orderBy(asc(membership.createdAt), asc(membership.id))
  if (!grant) return null
  const [u] = await db.select().from(user).where(eq(user.id, grant.userId))
  return u ?? null
}

/** The instance operator user — the single self-host account that gates login
 *  and controls instance-wide actions. Resolved from the explicitly stored owner
 *  id (`instance_settings.ownerUserId`), falling back to deriving it from the
 *  primary household's owner grant for installs that predate that field. Unlike
 *  the old lookup, this no longer hinges on the primary household literally
 *  having id 'household' — so an instance whose primary household was restored or
 *  re-provisioned under a different id still resolves an owner instead of
 *  silently reading as ownerless (and therefore open). */
export async function getOwnerUser(db: DB): Promise<User | null> {
  const { ownerUserId } = await getInstanceSettings(db)
  if (ownerUserId) {
    const u = await getUser(db, ownerUserId)
    if (u) return u
  }
  return deriveOwnerUser(db)
}

export async function getUser(db: DB, userId: string): Promise<User | null> {
  const [u] = await db.select().from(user).where(eq(user.id, userId))
  return u ?? null
}

/** Whether the instance requires login (is "locked"). Reads the persisted
 *  `authRequired` flag, which fails CLOSED: a lookup that can't resolve the owner
 *  keeps the instance locked rather than throwing it open. A stored owner
 *  password is also treated as locked, so no code path can set a password
 *  without the gate engaging. */
export async function isInstanceLocked(db: DB): Promise<boolean> {
  const { authRequired } = await getInstanceSettings(db)
  if (authRequired) {
    // Self-heal a provably stale flag: `instance_settings` is outside any
    // snapshot, so a restore that replaced the user table can leave this set
    // even though no imported account carries a password (issue #63). Failing
    // closed is right when the owner is merely *unresolvable* — but when the
    // database positively states no password exists anywhere, there is nothing
    // to authenticate against and the lock would only strand the owner.
    return anyPasswordExists(db)
  }
  const owner = await getOwnerUser(db)
  return (owner?.passwordHash ?? null) !== null
}

/** Whether any account holds a password hash — the credential the login gate
 *  checks against. False means the lock flag, if set, is stale. */
async function anyPasswordExists(db: DB): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(isNotNull(user.passwordHash)).limit(1)
  return row !== undefined
}

/** Recompute and persist the lock flag from the instance owner's current
 *  password. Call after any change to that password (set / change / clear). */
export async function syncAuthRequired(db: DB): Promise<void> {
  const owner = await getOwnerUser(db)
  await setAuthRequired(db, (owner?.passwordHash ?? null) !== null)
}

/** Reconcile the persisted owner id + lock flag after a restore. `instance_settings`
 *  lives outside the snapshot, so an import that replaced the user table can leave
 *  `ownerUserId` dangling at a deleted account and `authRequired` stale. Re-point
 *  the owner id at the resolvable owner and recompute the flag from its password,
 *  so a legitimate restore can't lock the operator out of their own instance. */
export async function reconcileInstanceOwner(db: DB): Promise<void> {
  const owner = await getOwnerUser(db)
  await setInstanceOwnerId(db, owner?.id ?? null)
  await syncAuthRequired(db)
}

/** True if the user is the instance operator — the single account that controls
 *  instance-wide actions (full-instance export / import / reset, open
 *  registration), as opposed to an owner of some other household. */
export async function isInstanceOwner(db: DB, userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const owner = await getOwnerUser(db)
  return owner?.id === userId
}

/** Throw unless the caller is the instance owner (see isInstanceOwner). */
export async function assertInstanceOwner(db: DB, userId: string | undefined): Promise<void> {
  if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  if (!(await isInstanceOwner(db, userId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the instance owner can do this.' })
  }
}

/** Canonical form of a username: trimmed and lower-cased. Usernames are
 *  case-insensitive, so both writes and lookups go through this — otherwise
 *  `Chris` and `chris` could both register and a wrong-case login would fail. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export async function getUserByUsername(db: DB, username: string): Promise<User | null> {
  const [u] = await db.select().from(user).where(eq(user.username, normalizeUsername(username)))
  return u ?? null
}

/** The user's *accepted* membership of a household, or undefined. The single
 *  source of truth for "does this user have access to this household". */
export async function acceptedMembership(db: DB, householdId: string, userId: string) {
  const [g] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.householdId, householdId), eq(membership.userId, userId)))
  return g && g.acceptedAt !== null ? g : undefined
}

/** The user's accepted memberships, most-privileged first (owner → viewer). */
export async function listMemberships(db: DB, userId: string) {
  const rows = await db.select().from(membership).where(eq(membership.userId, userId))
  return rows.filter((m) => m.acceptedAt !== null)
}

/** Where to drop a user after login: their most-privileged accepted household. */
export async function defaultHouseholdFor(db: DB, userId: string): Promise<string> {
  const rows = await listMemberships(db, userId)
  const rank = (r: string) => ROLE_RANK[r as Role] ?? -1
  rows.sort((a, b) => rank(b.role) - rank(a.role))
  return rows[0]?.householdId ?? DEFAULT_HOUSEHOLD_ID
}

/** Move a user's sessions off `householdId` onto their next-best remaining one,
 *  returning where they went — or null when they belong to no other household.
 *
 *  Called just before a household is deleted (#228). `session.activeHouseholdId`
 *  FK-cascades, so erasing one household would otherwise sign its owner out
 *  everywhere, including from households they still belong to. Only this user's
 *  sessions move: everyone else's access went away with the household, and ending
 *  their sessions is the right outcome. */
export async function repointSessionsAwayFrom(db: DB, userId: string, householdId: string): Promise<string | null> {
  const rows = (await listMemberships(db, userId)).filter((m) => m.householdId !== householdId)
  const rank = (r: string) => ROLE_RANK[r as Role] ?? -1
  rows.sort((a, b) => rank(b.role) - rank(a.role))
  const next = rows[0]?.householdId ?? null
  if (next) {
    await db
      .update(session)
      .set({ activeHouseholdId: next })
      .where(and(eq(session.userId, userId), eq(session.activeHouseholdId, householdId)))
  }
  return next
}
