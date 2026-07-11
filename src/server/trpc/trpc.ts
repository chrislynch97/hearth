import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context'
import { hasRole } from './tenant'
import { getValidSession, isInstanceLocked } from '../auth/session'

// tRPC procedures reachable WITHOUT authentication. A locked instance must still
// be able to show its login screen, accept a login, let an invitee create their
// account from an invite link, and let a client read auth/registration state.
// This is the single source of truth for "public": the coarse HTTP gate
// (index.ts) imports the same set, so the two layers can never drift apart.
// Everything NOT listed here is protected — new procedures are private by
// default and fail closed (see enforceAuthenticated).
export const PUBLIC_PROCEDURES = new Set([
  'auth.status',
  'auth.login',
  'auth.logout',
  'auth.registrationOpen',
  'auth.register',
  'invitations.info',
  'invitations.accept',
])

// Ship only a code and a safe message to the browser — never a stack trace or
// raw internal error text. tRPC's default formatter attaches `data.stack` and
// serializes the underlying error message whenever NODE_ENV !== 'production',
// which would leak file paths, DB constraint names and library internals from
// any raw `throw new Error(...)` or Drizzle/SQLite failure. We therefore always
// drop the stack and replace INTERNAL_SERVER_ERROR messages (which wrap
// unexpected/unhandled errors) with a generic string, regardless of NODE_ENV.
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const isInternal = error.code === 'INTERNAL_SERVER_ERROR'
    return {
      ...shape,
      message: isInternal ? 'Internal server error' : shape.message,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
      },
    }
  },
})

export const router = t.router

// Mutations exempt from the household-write-role guard because they carry their
// own authorization and are not household-data writes gated by a household role.
// Everything NOT listed here that writes needs at least the `member` role.
// Keyed by full procedure path (e.g. 'pots.create').
const WRITE_ROLE_EXEMPT = new Set([
  // Auth + self-service: available to any authenticated request, including one
  // whose role in the active household is unknown (e.g. a removed member still
  // holding a session), so people can still log out and manage their account.
  'auth.login',
  'auth.logout',
  'auth.setPassword',
  'auth.clearPassword',
  'auth.enrollMfa',
  'auth.confirmMfa',
  'auth.disableMfa',
  'users.updateProfile',
  'users.switchHousehold',
  'users.setPassword',
  // Pre-membership joins: authenticated by an invite token / open-registration
  // gate, not by a household role, so the caller legitimately has no role yet.
  // Each self-gates (token validity / registration-open + throttle).
  'auth.register',
  'invitations.accept',
  // Instance-wide actions: gated by assertInstanceOwner in the resolver, so they
  // depend on being the instance owner rather than on the active household role.
  'auth.setRegistrationOpen',
  'data.import',
  'data.reset',
  'data.backupNow',
])

/** Deny-by-default write guard: a mutation touching household data requires an
 *  explicit, known-writable role (`member` or higher). Viewers, and any request
 *  whose role resolves to undefined/unknown (e.g. a removed member still holding
 *  a session), are blocked — the guard fails closed, not open. Exempt mutations
 *  (see WRITE_ROLE_EXEMPT) carry their own authorization. Individual resolvers
 *  may additionally raise the bar with `assertRole` / `assertInstanceOwner`. */
const enforceWriteRole = t.middleware(async ({ ctx, type, path, next }) => {
  if (type === 'mutation' && !WRITE_ROLE_EXEMPT.has(path) && !hasRole(ctx.role, 'member')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You don’t have write access to this household.',
    })
  }
  return next()
})

/** In-band, fail-closed authentication. The coarse HTTP gate (index.ts) blocks
 *  unauthenticated calls to protected procedures on a locked instance by parsing
 *  the tRPC URL; this middleware enforces the SAME rule from inside tRPC, using
 *  tRPC's own resolved `path`, so it also covers query procedures and can't be
 *  bypassed if that hand-rolled URL parser ever drifts from the adapter. A
 *  request is allowed when the procedure is public, when it already carries an
 *  identity (`ctx.userId` — set for a real session or, on an open instance, the
 *  owner fallback), or, failing both, when a valid session cookie resolves.
 *  Otherwise, on a locked instance, it is rejected. */
const enforceAuthenticated = t.middleware(async ({ ctx, path, next }) => {
  if (!PUBLIC_PROCEDURES.has(path) && !ctx.userId) {
    // No ambient identity. On an open instance the owner fallback normally
    // supplies one; when it doesn't (locked instance, or the fallback was
    // withheld), only a live session may proceed.
    if (await isInstanceLocked(ctx.db)) {
      const session = await getValidSession(ctx.db, ctx.sessionToken)
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
      }
    }
  }
  return next()
})

/** The base procedure. Despite the historical name it is NOT anonymous-open:
 *  every procedure built from it is authenticated-by-default (enforceAuthenticated)
 *  unless its path is in PUBLIC_PROCEDURES, and write mutations additionally need a
 *  writable household role (enforceWriteRole). */
export const publicProcedure = t.procedure.use(enforceAuthenticated).use(enforceWriteRole)
