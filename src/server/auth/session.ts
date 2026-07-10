/** Server-side sessions. The cookie holds a session id; a request is
 *  authenticated when that id resolves to a live (unexpired) session row.
 *  Replaces the old stateless HMAC(password) token so sessions can carry user
 *  identity and be revoked (logout, password change, "sign out everywhere"). */
import { randomBytes } from 'node:crypto'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import type { DB } from '../db/client'
import { membership, session, user } from '../db/schema'
import type { Session, User } from '../db/schema'
import { getInstanceSettings, setAuthRequired } from '../db/instanceSettings'
import { DEFAULT_HOUSEHOLD_ID, ROLE_RANK, type Role } from '../trpc/tenant'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, matching the cookie Max-Age

/** A fresh, unguessable session id (256 bits). */
export function newSessionId(): string {
  return randomBytes(32).toString('hex')
}

/** Create a session for a user's active household; returns the cookie value. */
export async function createSession(db: DB, userId: string, householdId: string): Promise<string> {
  const id = newSessionId()
  const now = Date.now()
  await db
    .insert(session)
    .values({ id, userId, activeHouseholdId: householdId, createdAt: now, expiresAt: now + SESSION_TTL_MS })
  return id
}

/** The live session for a cookie value, or null if missing/unknown/expired. */
export async function getValidSession(db: DB, id: string | undefined): Promise<Session | null> {
  if (!id) return null
  const [s] = await db.select().from(session).where(eq(session.id, id))
  return s && s.expiresAt > Date.now() ? s : null
}

export async function deleteSession(db: DB, id: string): Promise<void> {
  await db.delete(session).where(eq(session.id, id))
}

/** Revoke every session for a user (used on password change / clear). */
export async function deleteUserSessions(db: DB, userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId))
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
