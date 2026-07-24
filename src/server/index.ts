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
import { startAuditPruneScheduler } from './audit/prune'
import { startUpdateScheduler } from './updateScheduler'
import { parseSessionCookie } from './auth/cookies'
import { getValidSession, isInstanceLocked, startSessionPurgeScheduler } from './auth/session'
import { PUBLIC_PROCEDURES } from './trpc/trpc'
import { allProceduresIn, allowedOrigins, isAllowedOrigin, openGuardConfig, trpcProcedures } from './auth/gate'
import { isPublicDeploy, startupSafetyProblems } from './auth/startup'
import { getInstanceSettings } from './db/instanceSettings'
import { parseTrustProxy } from './auth/trustProxy'
import { checkHealth, healthBody } from './ops/health'
import { startAuthAlertScheduler } from './ops/authAlerts'

// On an OPEN (password-less) instance the owner fallback resolves every
// anonymous request as the owner — safe on a trusted LAN, catastrophic if the
// instance is reachable from the internet. When we're bound to a non-loopback
// address with no password, refuse everything except the endpoints needed to
// lock the instance down, unless the operator has explicitly opted in with
// HEARTH_ALLOW_OPEN=1. `auth.setPassword` is allowed so a first-run owner can set
// a password (which locks the instance) from an otherwise-blocked UI.
const OPEN_ON_PUBLIC_ALLOWED = new Set([...PUBLIC_PROCEDURES, 'auth.setPassword'])

// The 64 MB bodyLimit below exists solely so `data.import` can restore a large
// JSON export. Every other /trpc route — including the unauthenticated auth
// endpoints — only ever carries a few KB, so we cap their bodies well below
// 64 MB. Without this a pre-auth caller could POST a multi-megabyte body (e.g. a
// giant "password", whose scrypt cost scales with length) at a public endpoint
// and make the server do proportional work. #45
const IMPORT_PROCEDURES = new Set(['data.import'])
const PUBLIC_BODY_LIMIT = 1 * 1024 * 1024 // 1 MB — Fastify's own default

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
// Read the open-on-public guard config through the shared helper so this gate and
// `auth.status` (which tells the client whether to show the first-run screen) can
// never disagree on how "reachable off-box" / "operator opted in" are computed.
const { bindIsLoopback: BIND_IS_LOOPBACK, allowOpen: ALLOW_OPEN } = openGuardConfig()
// Whether the operator has declared this instance internet-facing
// (HEARTH_PUBLIC=1). Only affects how loudly the startup safety checks below
// complain: fatal when public, a warning otherwise. See auth/startup.ts.
const IS_PUBLIC = isPublicDeploy()
// Extra origins accepted by the CSRF check below, for deployments where a proxy
// rewrites Host so it no longer matches the browser's origin. Empty by default.
const ALLOWED_ORIGINS = allowedOrigins()

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

  // Startup safety assertions (#55). Runs after migrate + seed (it reads the
  // instance settings) but before we construct Fastify, so a public instance
  // with a dangerous config never binds the port at all. On a declared-public
  // deploy an unsafe config is fatal — a config mistake is the likeliest way
  // this instance gets exposed, and failing to start is far cheaper than
  // serving a household's finances to the internet. Everywhere else (home LAN,
  // dev, demo) the same states are legitimate, so we only warn.
  await assertStartupSafety()

  startBackupScheduler(db)
  startAuditPruneScheduler(db)
  startSessionPurgeScheduler(db)
  startUpdateScheduler(db)
  startAuthAlertScheduler(db)

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
    // Serve our own SPA + tRPC and nothing else: no directive names a third-party
    // origin, so a self-hosted instance makes zero external requests and works on
    // an offline LAN (#54 — fonts are bundled via @fontsource, not Google Fonts).
    // Still needed: 'unsafe-inline' styles for Mantine's runtime-injected <style>
    // tags, and data: URIs for the inline favicon and the MFA-enrolment QR image.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
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

  // Readiness probe for an external uptime monitor (#57). Unlike /health it
  // actually asks whether we can still do the job: the DB answers, and the data
  // disk has room — the two ways a small unattended box dies quietly. 503 when
  // degraded, so a monitor alerts without parsing the body. The body is
  // boolean-only because this endpoint is unauthenticated; the numbers and the
  // error text go to the log instead.
  app.get('/healthz', async (_req, reply) => {
    const detail = await checkHealth(db)
    if (detail.status !== 'ok') app.log.error({ health: detail }, 'readiness check degraded')
    return reply.code(detail.status === 'ok' ? 200 : 503).send(healthBody(detail))
  })

  // Cap request-body size per /trpc route ahead of the auth gate and any body
  // parsing. `data.import` keeps the full 64 MB headroom (set at Fastify
  // construction); every other route — the public auth endpoints included — is
  // held to PUBLIC_BODY_LIMIT so an unauthenticated caller can't ship a huge body
  // to a pre-auth endpoint. A body sent without a Content-Length (chunked) still
  // falls back to the global 64 MB hard limit enforced during parsing. #45
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/')) return
    if (allProceduresIn(trpcProcedures(req.url), IMPORT_PROCEDURES)) return
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
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/') || req.method !== 'POST') return
    const origin = req.headers.origin
    if (isAllowedOrigin({ origin, host: req.headers.host, allowed: ALLOWED_ORIGINS })) return
    req.log.warn({ origin, host: req.headers.host }, 'rejected cross-origin write')
    return reply.code(403).send({ error: 'Cross-origin request rejected' })
  })

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
}

/** Check the boot-time config for states that are unsafe on a public instance,
 *  and refuse to start if this is one (see auth/startup.ts). Exits rather than
 *  throwing so the operator gets the problem list and nothing else — a stack
 *  trace here would bury the one thing they need to read. */
async function assertStartupSafety(): Promise<void> {
  const { allowOpenRegistration } = await getInstanceSettings(db)
  const problems = startupSafetyProblems({
    host: HOST,
    bindIsLoopback: BIND_IS_LOOPBACK,
    allowOpen: ALLOW_OPEN,
    locked: await isInstanceLocked(db),
    allowOpenRegistration,
    isPublic: IS_PUBLIC,
    trustProxy: process.env.HEARTH_TRUST_PROXY,
  })
  if (problems.length === 0) return

  const label = IS_PUBLIC ? 'REFUSING TO START' : 'WARNING'
  for (const problem of problems) console.error(`[hearth] ${label}: ${problem}`)

  if (!IS_PUBLIC) {
    console.error(
      '[hearth] The above is safe only on a trusted network. If this instance is reachable from ' +
        'the internet, fix it and set HEARTH_PUBLIC=1 so a config mistake stops the server ' +
        'instead of exposing your data.',
    )
    return
  }
  console.error(
    '[hearth] HEARTH_PUBLIC=1 declares this instance internet-facing, so the above is fatal. ' +
      'Fix the configuration and start again.',
  )
  await closeDb()
  process.exit(1)
}

main().catch((err) => {
  console.error('[hearth] fatal error during startup:', err)
  process.exit(1)
})
