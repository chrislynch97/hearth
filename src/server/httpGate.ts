/** The /trpc routes and the coarse HTTP gates in front of them, registered as a
 *  single encapsulated Fastify scope so the gates run exactly when the router
 *  matches a tRPC route.
 *
 *  These used to be global `onRequest` hooks that decided "is this a tRPC
 *  request?" from `req.url.startsWith('/trpc/')`. find-my-way percent-decodes a
 *  path before matching it while `req.url` stays raw, so `/%74rpc/pots.list`
 *  routed to the tRPC handler with every hook skipped — the body cap, the
 *  cross-origin write guard and the auth gate all silently absent (#179).
 *  Binding them to the route instead of to a string prefix means no spelling of
 *  the URL can reach the router without passing them. */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { appRouter } from './trpc/router'
import type { AppRouter } from './trpc/router'
import { createContext, rememberValidatedSession } from './trpc/context'
import { parseSessionCookie } from './auth/cookies'
import { getValidSession, isInstanceLocked } from './auth/session'
import { PUBLIC_PROCEDURES } from './trpc/trpc'
import { allProceduresIn, isAllowedOrigin, isOpenAccessBlocked, trpcProcedures } from './auth/gate'
import type { OpenGuardConfig } from './auth/gate'
import type { DB } from './db/client'

export const TRPC_PREFIX = '/trpc'

// On an OPEN (password-less) instance the owner fallback resolves every
// anonymous request as the owner — safe on a trusted LAN, catastrophic if the
// instance is reachable from the internet. When we're bound to a non-loopback
// address with no password, refuse everything except the endpoints needed to
// lock the instance down, unless the operator has explicitly opted in with
// HEARTH_ALLOW_OPEN=1. `auth.setPassword` is allowed so a first-run owner can set
// a password (which locks the instance) from an otherwise-blocked UI.
const OPEN_ON_PUBLIC_ALLOWED = new Set([...PUBLIC_PROCEDURES, 'auth.setPassword'])

// The 64 MB bodyLimit set at Fastify construction exists solely so `data.import`
// can restore a large JSON export. Every other /trpc route — including the
// unauthenticated auth endpoints — only ever carries a few KB, so we cap their
// bodies well below 64 MB. Without this a pre-auth caller could POST a
// multi-megabyte body (e.g. a giant "password", whose scrypt cost scales with
// length) at a public endpoint and make the server do proportional work. #45
const IMPORT_PROCEDURES = new Set(['data.import'])
const PUBLIC_BODY_LIMIT = 1 * 1024 * 1024 // 1 MB — Fastify's own default

/** The procedure(s) a matched tRPC request targets. Read from the adapter's
 *  `:path` route parameter — the exact string the adapter hands to tRPC — rather
 *  than re-parsed out of the raw URL, so the gate and the adapter cannot resolve
 *  different names. */
function requestedProcedures(req: FastifyRequest): string[] {
  return trpcProcedures((req.params as { path?: string }).path ?? '')
}

export interface TrpcScopeOptions {
  db: DB
  /** Bind address, opt-in and public-deploy flags for the open-on-public guard.
   *  Passed whole and evaluated through `isOpenAccessBlocked`, so this gate and
   *  the `firstRunRequired` flag the client reads can't drift apart. */
  openGuard: OpenGuardConfig
  /** Extra origins accepted by the cross-origin write guard. */
  allowedOrigins: string[]
}

export async function registerTrpcScope(
  app: FastifyInstance,
  { db, openGuard, allowedOrigins }: TrpcScopeOptions,
): Promise<void> {
  await app.register(
    async (scope) => {
      // Cap request-body size per route ahead of the auth gate and any body
      // parsing. `data.import` keeps the full 64 MB headroom; every other route —
      // the public auth endpoints included — is held to PUBLIC_BODY_LIMIT so an
      // unauthenticated caller can't ship a huge body to a pre-auth endpoint. A
      // body sent without a Content-Length (chunked) still falls back to the
      // global 64 MB hard limit enforced during parsing. #45
      scope.addHook('onRequest', async (req, reply) => {
        if (allProceduresIn(requestedProcedures(req), IMPORT_PROCEDURES)) return
        const declaredLength = Number(req.headers['content-length'])
        if (Number.isFinite(declaredLength) && declaredLength > PUBLIC_BODY_LIMIT) {
          return reply.code(413).send({ error: 'Request body too large' })
        }
      })

      // Cross-origin write guard (#50). tRPC sends every mutation as a POST, so
      // holding POSTs to a same-origin (or explicitly allow-listed) Origin blocks a
      // cross-site request forgery independently of the session cookie's SameSite=Lax
      // — which is the only thing standing between a malicious page and a
      // state-changing call today, and which we can't verify the browser honours.
      // GETs are left alone: tRPC queries are reads, and a cross-site GET can't read
      // the response anyway (no CORS headers are served).
      scope.addHook('onRequest', async (req, reply) => {
        if (req.method !== 'POST') return
        const origin = req.headers.origin
        if (isAllowedOrigin({ origin, host: req.headers.host, allowed: allowedOrigins })) return
        req.log.warn({ origin, host: req.headers.host }, 'rejected cross-origin write')
        return reply.code(403).send({ error: 'Cross-origin request rejected' })
      })

      // Coarse auth gate. Authorization is also enforced in-band by the tRPC
      // `enforceAuthenticated` middleware (trpc/trpc.ts); this is a cheap first line
      // that rejects unauthenticated requests before they reach a resolver. Both
      // layers key on the same PUBLIC_PROCEDURES set, so they can't drift.
      scope.addHook('onRequest', async (req, reply) => {
        const procedures = requestedProcedures(req)

        if (!(await isInstanceLocked(db))) {
          // Open instance. Fine on loopback, or when the operator has opted in —
          // neither of which a declared-public deploy can claim (#115).
          // Otherwise it's reachable from the network with no password, so anyone
          // could act as the owner — allow only the endpoints needed to lock it.
          if (!isOpenAccessBlocked({ locked: false, ...openGuard })) return
          if (allProceduresIn(procedures, OPEN_ON_PUBLIC_ALLOWED)) return
          return reply.code(403).send({
            error: openGuard.isPublic
              ? 'This instance has no owner password and is declared internet-facing. ' +
                'Set an owner password to use it.'
              : 'This instance has no owner password and is exposed on a non-loopback address. ' +
                'Set an owner password, or set HEARTH_ALLOW_OPEN=1 to permit open access.',
          })
        }

        // Locked instance: block every tRPC call except the public auth endpoints
        // unless the request carries a valid session — for ANY user, not just the
        // owner, so invited members and self-registered owners of other households
        // can use the app.
        if (allProceduresIn(procedures, PUBLIC_PROCEDURES)) return

        const token = parseSessionCookie(req.headers.cookie)
        const session = await getValidSession(db, token)
        // Hand the validated session to createContext so it doesn't re-query it.
        rememberValidatedSession(req, session)
        if (session) return

        return reply.code(401).send({ error: 'Authentication required' })
      })

      // Empty prefix: the scope above already carries TRPC_PREFIX, and the adapter
      // appends its own `/:path` to whatever it is given.
      await scope.register(fastifyTRPCPlugin, {
        prefix: '',
        trpcOptions: { router: appRouter, createContext },
      } satisfies FastifyTRPCPluginOptions<AppRouter>)
    },
    { prefix: TRPC_PREFIX },
  )
}
