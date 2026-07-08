/** Server-side sessions. The cookie holds a session id; a request is
 *  authenticated when that id resolves to a live (unexpired) session row.
 *  Replaces the old stateless HMAC(password) token so sessions can carry user
 *  identity and be revoked (logout, password change, "sign out everywhere"). */
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { membership, session, user } from '../db/schema'
import type { Session, User } from '../db/schema'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'

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

/** The owner user of the default household — the single self-host account until
 *  multi-user login (B3). */
export async function getOwnerUser(db: DB): Promise<User | null> {
  const [grant] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.householdId, DEFAULT_HOUSEHOLD_ID), eq(membership.role, 'owner')))
  if (!grant) return null
  const [u] = await db.select().from(user).where(eq(user.id, grant.userId))
  return u ?? null
}
