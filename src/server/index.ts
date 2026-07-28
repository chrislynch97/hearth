import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyHelmet from '@fastify/helmet'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { runMigrations } from './db/migrate'
import { ensureSeed } from './db/seed'
import { db, closeDb } from './db/client'
import { startBackupScheduler } from './backup/runner'
import { startAuditPruneScheduler } from './features/admin/prune'
import { startUpdateScheduler } from './updateScheduler'
import { isInstanceLocked, startSessionPurgeScheduler } from './auth/session'
import { allowedOrigins, openGuardConfig } from './auth/gate'
import { registerTrpcScope } from './httpGate'
import { isPublicDeploy, startupSafetyProblems } from './auth/startup'
import { getInstanceSettings } from './db/instanceSettings'
import { parseTrustProxy } from './auth/trustProxy'
import { redactUrl } from './logRedact'
import { checkHealth, healthBody } from './ops/health'
import { startAuthAlertScheduler } from './ops/authAlerts'
import { resolveMailConfig } from './mail/config'

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
  reportMailConfig()

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
    // Fastify's default request serializer writes `req.url` verbatim, which
    // would put a live invite token into the log for 7 days. Mirror the default
    // shape with the URL run through redactUrl (#176). Its `accept-version`
    // field is omitted — Hearth has no versioned routes for it to describe.
    logger: {
      serializers: {
        req: (req) => ({
          method: req.method,
          url: redactUrl(req.url),
          host: req.host,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
      },
    },
    bodyLimit: 64 * 1024 * 1024,
    // tRPC's httpBatchLink packs every procedure name of a batched request into
    // the URL path (`/trpc/a.list,b.list,c.list?batch=1`). Fastify's default
    // `maxParamLength` of 100 silently 404s any batch whose joined names exceed
    // that — which happens on data-heavy pages (Pots batches ~9 queries), taking
    // the whole batch (and every query in it) down. Give the router real headroom.
    //
    // Nested under `routerOptions`, not passed flat: the top-level spelling is
    // deprecated in Fastify 5 (FSTDEP022) and goes away in 6. Failure on that
    // bump would be silent — not a crash but every batched query 404ing at once —
    // so it's worth moving while the warning is still there to act on.
    routerOptions: { maxParamLength: 5000 },
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

  // The /trpc routes plus the body cap, cross-origin write guard and auth gate
  // in front of them, as one encapsulated scope so the gates are bound to the
  // route rather than to a `req.url` prefix test. See httpGate.ts (#179).
  await registerTrpcScope(app, {
    db,
    bindIsLoopback: BIND_IS_LOOPBACK,
    allowOpen: ALLOW_OPEN,
    allowedOrigins: ALLOWED_ORIGINS,
  })

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

/** Resolve the mail config once at boot and say what it found (#111). A relay
 *  that's misconfigured otherwise looks exactly like one that's switched off:
 *  every email-backed feature is simply absent, with no clue why. Throws, so a
 *  bad config is fatal here rather than a silent no-op at the first invite. */
function reportMailConfig(): void {
  const config = resolveMailConfig()
  if (!config) {
    console.log('[hearth] email is off (HEARTH_MAIL_TRANSPORT unset) — invites are copy-a-link')
    return
  }
  const via = config.smtp ? `smtp ${config.smtp.host}:${config.smtp.port} (${config.smtp.tls})` : 'log (not sent)'
  console.log(`[hearth] email via ${via}, from ${config.from}, links point at ${config.publicUrl}`)
}

main().catch((err) => {
  console.error('[hearth] fatal error during startup:', err)
  process.exit(1)
})
