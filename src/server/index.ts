import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { appRouter } from './trpc/router'
import type { AppRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { runMigrations } from './db/migrate'
import { ensureSeed } from './db/seed'
import { db } from './db/client'
import { startBackupScheduler } from './backup/runner'
import { household } from './db/schema'
import { parseSessionCookie } from './auth/cookies'
import { isValidSessionToken } from './auth/password'

// tRPC procedures reachable without authentication (so a locked instance can
// still show the login screen and accept a login).
const PUBLIC_PROCEDURES = new Set(['auth.status', 'auth.login', 'auth.logout'])

const PORT = Number(process.env.PORT ?? 8787)

async function main() {
  await runMigrations()
  await ensureSeed(db)
  startBackupScheduler(db)

  // 64 MB body limit so restoring a large JSON export isn't rejected (default 1 MB).
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 })

  // Shared-password gate: when a password is set, block every tRPC call except
  // the auth endpoints unless the request carries a valid session cookie.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/')) return
    const [hh] = await db.select().from(household).where(eq(household.id, 'household'))
    if (!hh?.passwordHash) return

    const path = req.url.slice('/trpc/'.length).split('?')[0] ?? ''
    const procedures = path.split(',').map((p) => decodeURIComponent(p))
    if (procedures.length > 0 && procedures.every((p) => PUBLIC_PROCEDURES.has(p))) return

    const token = parseSessionCookie(req.headers.cookie)
    if (isValidSessionToken(token, hh.passwordHash)) return

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

  // Graceful shutdown: when the process manager (e.g. the HA Supervisor / Docker)
  // stops the container it sends SIGTERM. Close the server and exit 0 so the stop
  // is clean — a non-zero exit is read as a crash and triggers a restart loop.
  let closing = false
  const shutdown = async (signal: string) => {
    if (closing) return
    closing = true
    app.log.info(`Received ${signal}, shutting down`)
    try {
      await app.close()
    } catch (err) {
      app.log.error(err)
    }
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
