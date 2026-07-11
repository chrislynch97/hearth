/** Server-side sessions. The cookie holds a session id; a request is
 *  authenticated when that id resolves to a live (unexpired) session row.
 *  Replaces the old stateless HMAC(password) token so sessions can carry user
 *  identity and be revoked (logout, password change, "sign out everywhere"). */
import { randomBytes } from 'node:crypto'
import { and, asc, eq, isNotNull, lt } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import type { DB, DBOrTx } from '../db/client'
import { membership, session, user } from '../db/schema'
import type { Session, User } from '../db/schema'
import { getInstanceSettings, setAuthRequired } from '../db/instanceSettings'
import { DEFAULT_HOUSEHOLD_ID, ROLE_RANK, type Role } from '../trpc/tenant'
import { newId } from '../../shared/ids'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, matching the cookie Max-Age

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

/** A fresh, unguessable session id (256 bits). */
export function newSessionId(): string {
  return randomBytes(32).toString('hex')
}

/** Create a session for a user's active household; returns the cookie value. */
export async function createSession(db: DB, userId: string, householdId: string): Promise<string> {
  const id = newSessionId()
  const now = new Date()
  await db
    .insert(session)
    .values({
      id,
      userId,
      activeHouseholdId: householdId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
  return id
}

/** The live session for a cookie value, or null if missing/unknown/expired. */
export async function getValidSession(db: DB, id: string | undefined): Promise<Session | null> {
  if (!id) return null
  const [s] = await db.select().from(session).where(eq(session.id, id))
  return s && s.expiresAt.getTime() > Date.now() ? s : null
}

export async function deleteSession(db: DB, id: string): Promise<void> {
  await db.delete(session).where(eq(session.id, id))
}

/** Revoke every session for a user (used on password change / clear). */
export async function deleteUserSessions(db: DB, userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId))
}

const PURGE_INTERVAL_MS = 60 * 60 * 1000 // hourly; expiry is 30 days, so timing is not sensitive

/** Delete every session whose TTL has already elapsed. `getValidSession` ignores
 *  expired rows at read time, so this only reclaims storage — but without it the
 *  `session` table grows forever on a long-running instance (one dead row per
 *  login, kept indefinitely). */
export async function deleteExpiredSessions(db: DB, now: Date = new Date()): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, now))
}

/** Start the periodic purge of expired sessions. Mirrors the backup scheduler:
 *  an unref'd interval that never keeps the process alive on its own, running an
 *  immediate first sweep so a fresh boot doesn't wait an hour to clear a backlog. */
export function startSessionPurgeScheduler(db: DB): void {
  const tick = async () => {
    try {
      await deleteExpiredSessions(db)
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
  if (authRequired) return true
  const owner = await getOwnerUser(db)
  return (owner?.passwordHash ?? null) !== null
}

/** Recompute and persist the lock flag from the instance owner's current
 *  password. Call after any change to that password (set / change / clear). */
export async function syncAuthRequired(db: DB): Promise<void> {
  const owner = await getOwnerUser(db)
  await setAuthRequired(db, (owner?.passwordHash ?? null) !== null)
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
