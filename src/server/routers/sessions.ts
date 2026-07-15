import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { recordSecurityEvent } from '../trpc/audit'
import { deleteOtherUserSessions, deleteUserSessionById, listUserSessions } from '../auth/session'

/**
 * Let a user see and end their own logins (issue #50).
 *
 * Until now a session could only be revoked as a side effect of changing the
 * password, and nothing showed you what sessions existed — so "I think someone
 * else is logged in as me" had no answer short of a password change. These
 * procedures give that story a direct route: look at the list, end the one you
 * don't recognise.
 *
 * Every procedure is scoped to `ctx.userId`. There is deliberately no way to
 * list or revoke *another* user's sessions, not even for an owner: that would be
 * a household-admin power over someone's account, which is a different feature
 * with a different threat model. Access removal already handles the case where
 * someone should lose a household.
 */
export const sessionsRouter = router({
  /** The current user's live sessions, most recently active first.
   *
   *  Never returns the row id: it is the sha256 of the live cookie token, so
   *  handing it to a client would undo storing tokens hashed at rest (#47) — a
   *  read-only XSS could lift it and revoke sessions, and the hash is exactly the
   *  value a database-level lookup keys on. Clients get an opaque per-request
   *  `ref` instead, which `revoke` resolves back through this same list. */
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    const rows = await listUserSessions(ctx.db, ctx.userId)
    return rows.map((s, i) => ({
      ref: String(i),
      current: s.id === ctx.sessionId,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      absoluteExpiresAt: s.absoluteExpiresAt,
      userAgent: s.userAgent,
      ip: s.ip,
    }))
  }),

  /** End one of the current user's sessions. `ref` is an index into the same
   *  ordering `list` returns; it is re-derived here rather than trusted, so the
   *  worst a stale ref can do is revoke a different session of your own. */
  revoke: publicProcedure.input(z.object({ ref: z.string() })).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    const rows = await listUserSessions(ctx.db, ctx.userId)
    const target = rows[Number(input.ref)]
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'That session has already ended.' })

    const isCurrent = target.id === ctx.sessionId
    await deleteUserSessionById(ctx.db, ctx.userId, target.id)
    recordSecurityEvent(ctx, {
      entityType: 'user',
      entityId: ctx.userId,
      action: 'sessions_revoked',
      details: { count: 1, scope: isCurrent ? 'current' : 'one' },
    })
    // Revoking the session you're on is just a logout; clear the cookie so the
    // browser stops presenting a token the server will now reject.
    if (isCurrent) ctx.setSessionCookie?.(null)
    return { ok: true as const, count: 1, endedCurrent: isCurrent }
  }),

  /** Sign out everywhere else: end every session for the current user except the
   *  one making the request. An explicit button for what used to be reachable
   *  only as a side effect of changing your password. */
  revokeOthers: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    if (!ctx.sessionId) {
      // An open (password-less) instance resolves an ambient owner identity with
      // no session of its own. There is no "this device" to keep, so refuse
      // rather than silently sign the owner out of every real session.
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active session.' })
    }
    const count = await deleteOtherUserSessions(ctx.db, ctx.userId, ctx.sessionId)
    if (count > 0) {
      recordSecurityEvent(ctx, {
        entityType: 'user',
        entityId: ctx.userId,
        action: 'sessions_revoked',
        details: { count, scope: 'others' },
      })
    }
    return { ok: true as const, count }
  }),
})
