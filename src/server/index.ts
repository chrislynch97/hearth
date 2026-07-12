import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyHelmet from '@fastify/helmet'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { appRouter } from './trpc/router'
import type { AppRouter } from './trpc/router'
import { createContext, rememberValidatedSession } from './trpc/context'
import { runMigrations } from './db/migrate'
import { ensureSeed } from './db/seed'
import { db, closeDb } from './db/client'
import { startBackupScheduler } from './backup/runner'
import { parseSessionCookie } from './auth/cookies'
import { getValidSession, isInstanceLocked, startSessionPurgeScheduler } from './auth/session'
import { PUBLIC_PROCEDURES } from './trpc/trpc'
import { allProceduresIn, openGuardConfig, trpcProcedures } from './auth/gate'
import { parseTrustProxy } from './auth/trustProxy'

// On an OPEN (password-less) instance the owner fallback resolves every
// anonymous request as the owner — safe on a trusted LAN, catastrophic if the
// instance is reachable from the internet. When we're bound to a non-loopback
// address with no password, refuse everything except the endpoints needed to
// lock the instance down, unless the operator has explicitly opted in with
// HEARTH_ALLOW_OPEN=1. `auth.setPassword` is allowed so a first-run owner can set
// a password (which locks the instance) from an otherwise-blocked UI.
const OPEN_ON_PUBLIC_ALLOWED = new Set([...PUBLIC_PROCEDURES, 'auth.setPassword'])

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
// Read the open-on-public guard config through the shared helper so this gate and
// `auth.status` (which tells the client whether to show the first-run screen) can
// never disagree on how "reachable off-box" / "operator opted in" are computed.
const { bindIsLoopback: BIND_IS_LOOPBACK, allowOpen: ALLOW_OPEN } = openGuardConfig()

// A rejected promise or thrown error *outside* a request would otherwise take the
// whole process down with no explanation — the exact shape of "ran fine, then
// randomly stopped". Log the reason so it lands in the container logs. A stray
// background rejection shouldn't be fatal for a self-hosted app, so we keep
// running; an uncaughtException can leave us in an unknown state, so we log and
// exit (the container manager then restarts us).
process.on('unhandledRejection', (reason) => {
  console.error('[hearth] unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[hearth] uncaughtException:', err)
  process.exit(1)
})

async function main() {
  // Register the shutdown handlers BEFORE migrate + seed (which can be slow on a
  // Raspberry Pi). A stop requested mid-startup then still closes cleanly and
  // exits 0, instead of a hard kill that a container manager reads as a crash and
  // restart-loops.
  // `let`, not `const`: the shutdown closure below closes over `app` and must be
  // registered before it's assigned (so a stop mid-startup still exits cleanly).
  // eslint-disable-next-line prefer-const
  let app: FastifyInstance | undefined
  let closing = false
  const shutdown = async (signal: string) => {
    if (closing) return
    closing = true
    console.log(`[hearth] received ${signal}, shutting down`)
    try {
      await app?.close()
      // Close the DB cleanly once requests have drained: end the Postgres pool
      // (or the embedded PGlite handle) so connections aren't left dangling.
      await closeDb()
    } catch (err) {
      console.error(err)
    }
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await runMigrations()
  await ensureSeed(db)
  startBackupScheduler(db)
  startSessionPurgeScheduler(db)

  // 64 MB body limit so restoring a large JSON export isn't rejected (default 1 MB).
  // `trustProxy` is opt-in (HEARTH_TRUST_PROXY): only set it when a reverse proxy /
  // tunnel sits in front, so the login rate limiter keys on the real client IP
  // (X-Forwarded-For) instead of the proxy. Set it to the number of proxy hops in
  // front (a single proxy = `1`), NOT boolean `true` — trusting the whole XFF
  // chain would let a client prepend a fake IP and dodge the limiter. Defaults off
  // (directly exposed). See parseTrustProxy for the accepted forms.
  app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024 * 1024,
    // tRPC's httpBatchLink packs every procedure name of a batched request into
    // the URL path (`/trpc/a.list,b.list,c.list?batch=1`). Fastify's default
    // `maxParamLength` of 100 silently 404s any batch whose joined names exceed
    // that — which happens on data-heavy pages (Pots batches ~9 queries), taking
    // the whole batch (and every query in it) down. Give the router real headroom.
    maxParamLength: 5000,
    trustProxy: parseTrustProxy(process.env.HEARTH_TRUST_PROXY),
  })

  // Security headers (defence-in-depth for a directly internet-exposed instance;
  // harmless on a trusted LAN). The app owns these headers; if you additionally
  // set any of them at a reverse proxy, drop them here (or there) so they aren't
  // emitted twice. HSTS is only honoured by browsers over HTTPS, so it's inert on
  // a plain-HTTP LAN deployment and doesn't need to be conditional.
  await app.register(fastifyHelmet, {
    // Serve our own SPA + tRPC; allow the Google Fonts stylesheet/font files the
    // client loads, Mantine's runtime-injected inline <style> tags, and data: URIs
    // for the inline favicon and the MFA-enrolment QR image.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // Don't force http→https upgrades: the LAN deployment is often plain HTTP
        // and the upgrade would make every request fail.
        upgradeInsecureRequests: null,
      },
    },
  })

  // Cheap liveness probe — returns 200 as soon as we're listening, without
  // touching the DB or serving the SPA. Suitable as a Docker/orchestrator health
  // check target.
  app.get('/health', async () => ({ status: 'ok' }))

  // Coarse outer auth gate. Authorization is also enforced in-band by the tRPC
  // `enforceAuthenticated` middleware (trpc/trpc.ts); this is a cheap first line
  // that rejects unauthenticated requests before they reach a resolver. Both
  // layers key on the same PUBLIC_PROCEDURES set, so they can't drift.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/')) return
    const procedures = trpcProcedures(req.url)

    if (!(await isInstanceLocked(db))) {
      // Open instance. Fine on loopback, or when the operator has opted in.
      // Otherwise it's reachable from the network with no password, so anyone
      // could act as the owner — allow only the endpoints needed to lock it.
      if (BIND_IS_LOOPBACK || ALLOW_OPEN) return
      if (allProceduresIn(procedures, OPEN_ON_PUBLIC_ALLOWED)) return
      return reply.code(403).send({
        error:
          'This instance has no owner password and is exposed on a non-loopback address. ' +
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

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  } satisfies FastifyTRPCPluginOptions<AppRouter>)

  const clientDir =
    process.env.CLIENT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../client')
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/trpc')) return reply.code(404).send({ error: 'not found' })
      return reply.sendFile('index.html')
    })
  }

  await app.listen({ port: PORT, host: HOST })
  console.log(`[hearth] listening on ${HOST}:${PORT}`)

  // Warn loudly if we're serving an open (password-less) instance on a
  // network-reachable address only because the operator opted in.
  if (!BIND_IS_LOOPBACK && ALLOW_OPEN && !(await isInstanceLocked(db))) {
    console.warn(
      `[hearth] WARNING: running OPEN (no owner password) on ${HOST} with HEARTH_ALLOW_OPEN=1 — ` +
        'anyone who can reach this address has full owner access. Set an owner password.',
    )
  }
}

main().catch((err) => {
  console.error('[hearth] fatal error during startup:', err)
  process.exit(1)
})
