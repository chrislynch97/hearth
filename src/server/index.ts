import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { appRouter } from './trpc/router'
import type { AppRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { runMigrations } from './db/migrate'
import { ensureSeed } from './db/seed'
import { db } from './db/client'
import { startBackupScheduler } from './backup/runner'
import { parseSessionCookie } from './auth/cookies'
import { getValidSession, isInstanceLocked } from './auth/session'

// tRPC procedures reachable without authentication (so a locked instance can
// still show the login screen, accept a login, or let an invitee create their
// account from an invite link).
const PUBLIC_PROCEDURES = new Set([
  'auth.status',
  'auth.login',
  'auth.logout',
  'auth.registrationOpen',
  'auth.register',
  'invitations.info',
  'invitations.accept',
])

const PORT = Number(process.env.PORT ?? 8787)

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
      // Release the SQLite file cleanly once requests have drained, so an
      // in-flight write can't leave a stale rollback journal that blocks the
      // next boot (journal_mode=delete leaves a `-journal` on an unclean kill).
      db.$client.close()
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

  // 64 MB body limit so restoring a large JSON export isn't rejected (default 1 MB).
  // `trustProxy` is opt-in (HEARTH_TRUST_PROXY=1): only enable it when a reverse
  // proxy / tunnel sits in front, so the login rate limiter keys on the real
  // client IP (X-Forwarded-For) instead of the proxy. Enabling it while directly
  // exposed would let clients spoof that header and evade the limiter, so it
  // defaults off.
  app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024 * 1024,
    trustProxy: process.env.HEARTH_TRUST_PROXY === '1',
  })

  // Cheap liveness probe — returns 200 as soon as we're listening, without
  // touching the DB or serving the SPA. Suitable as a Docker/orchestrator health
  // check target.
  app.get('/health', async () => ({ status: 'ok' }))

  // Auth gate: when the instance is locked (the primary owner has a password),
  // block every tRPC call except the public auth endpoints unless the request
  // carries a valid session — for ANY user, not just the owner, so invited
  // members and self-registered owners of other households can use the app.
  // No owner password (or not yet provisioned) = an open instance; all passes.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/')) return
    if (!(await isInstanceLocked(db))) return

    const path = req.url.slice('/trpc/'.length).split('?')[0] ?? ''
    const procedures = path.split(',').map((p) => decodeURIComponent(p))
    if (procedures.length > 0 && procedures.every((p) => PUBLIC_PROCEDURES.has(p))) return

    const token = parseSessionCookie(req.headers.cookie)
    const session = await getValidSession(db, token)
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

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`[hearth] listening on :${PORT}`)
}

main().catch((err) => {
  console.error('[hearth] fatal error during startup:', err)
  process.exit(1)
})
