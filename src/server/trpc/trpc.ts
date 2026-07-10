import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context'
import { hasRole } from './tenant'

const t = initTRPC.context<Context>().create()

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

export const publicProcedure = t.procedure.use(enforceWriteRole)
