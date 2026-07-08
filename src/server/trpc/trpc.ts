import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context'

const t = initTRPC.context<Context>().create()

export const router = t.router

// Mutations a viewer (read-only member) may still call: authentication and
// self-service account/household actions. Everything else that writes is blocked
// for viewers. Keyed by full procedure path (e.g. 'pots.create').
const VIEWER_WRITE_ALLOWED = new Set([
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
])

/** Block writes for viewers. Read-only members can browse a household but not
 *  change its data; their own account + auth actions stay available. */
const enforceViewerReadOnly = t.middleware(async ({ ctx, type, path, next }) => {
  if (type === 'mutation' && ctx.role === 'viewer' && !VIEWER_WRITE_ALLOWED.has(path)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your role in this household is read-only.',
    })
  }
  return next()
})

export const publicProcedure = t.procedure.use(enforceViewerReadOnly)
