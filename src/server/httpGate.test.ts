import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { eq } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestDb } from './db/testdb'
import { ensureSeed } from './db/seed'
import { user } from './db/schema'
import { getOwnerUser } from './auth/session'
import { hashPassword } from './auth/password'
import { registerTrpcScope } from './httpGate'

// Belt and braces: if a request ever slipped past the gate into a resolver,
// createContext would dynamically import db/client, which OPENS (and creates)
// whatever DATABASE_URL names. Point that at a throwaway directory so a
// regression in this file can never reach the real database.
process.env.DATABASE_URL = mkdtempSync(join(tmpdir(), 'hearth-gate-test-'))

const SECRET = 'sibling file that must never be served'

/** A server wired exactly like index.ts: the encapsulated /trpc scope, then
 *  @fastify/static over a client dir, then the SPA fallback. The static root has
 *  a sibling file one level up, so a traversal that escapes the root is visible
 *  as content rather than as a status code. */
async function buildApp(opts: {
  locked: boolean
  bindIsLoopback?: boolean
  allowOpen?: boolean
}): Promise<FastifyInstance> {
  const db = await makeTestDb()
  await ensureSeed(db)
  if (opts.locked) {
    const owner = await getOwnerUser(db)
    await db
      .update(user)
      .set({ passwordHash: await hashPassword('correct-horse-staple') })
      .where(eq(user.id, owner!.id))
  }

  const root = mkdtempSync(join(tmpdir(), 'hearth-client-'))
  writeFileSync(join(root, 'SECRET.txt'), SECRET)
  const clientDir = join(root, 'client')
  mkdirSync(clientDir)
  writeFileSync(join(clientDir, 'index.html'), '<html>SPA</html>')

  // Mirrors index.ts, `routerOptions` spelling included — a harness that
  // configured the router differently from production could not catch a
  // regression in how production configures it.
  const app = Fastify({ routerOptions: { maxParamLength: 5000 }, bodyLimit: 64 * 1024 * 1024 })
  await registerTrpcScope(app, {
    db,
    bindIsLoopback: opts.bindIsLoopback ?? true,
    allowOpen: opts.allowOpen ?? false,
    allowedOrigins: [],
  })
  await app.register(fastifyStatic, { root: clientDir })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/trpc')) return reply.code(404).send({ error: 'not found' })
    return reply.sendFile('index.html')
  })
  return app
}

// Spellings that find-my-way decodes back to the `/trpc` prefix before matching,
// while `req.url` keeps the raw bytes. The gate used to test
// `req.url.startsWith('/trpc/')`, so every one of these reached the router with
// the body cap, the cross-origin guard and the auth gate all skipped (#179).
const ENCODED_PREFIXES = [
  '/%74rpc/pots.list', // 't'
  '/t%72pc/pots.list', // 'r'
  '/%74%72%70%63/pots.list', // the whole prefix
  '/trpc/%2570ots.list', // double-encoded procedure: tRPC resolves pots.list
  '/foo/../trpc/pots.list', // dot-segment traversal, normalised by Fastify
  '/foo/%2E%2E/trpc/pots.list', // encoded dot-segments
]

describe('the /trpc gate is bound to the route, not to a req.url prefix', () => {
  it('401s a protected procedure on a locked instance, however the URL is spelled', async () => {
    const app = await buildApp({ locked: true })
    for (const url of ['/trpc/pots.list', ...ENCODED_PREFIXES]) {
      const res = await app.inject({ method: 'GET', url })
      // 401, not 404: the router matched and the gate rejected it. A 404 would
      // mean the route never existed and the assertion proved nothing.
      expect(res.statusCode, url).toBe(401)
    }
    await app.close()
  })

  it('applies the cross-origin write guard to every spelling', async () => {
    const app = await buildApp({ locked: true })
    for (const url of ['/trpc/pots.create', ...ENCODED_PREFIXES]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { origin: 'https://evil.example', host: 'hearth.local:8787' },
        payload: {},
      })
      expect(res.statusCode, url).toBe(403)
      expect(res.json().error, url).toBe('Cross-origin request rejected')
    }
    await app.close()
  })

  it('applies the pre-auth body cap to every spelling', async () => {
    const app = await buildApp({ locked: true })
    for (const url of ['/trpc/auth.login', ...ENCODED_PREFIXES]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { 'content-length': String(8 * 1024 * 1024), 'content-type': 'application/json' },
        payload: 'x'.repeat(8 * 1024 * 1024),
      })
      expect(res.statusCode, url).toBe(413)
    }
    await app.close()
  })

  it('holds the open-on-public guard for every spelling', async () => {
    // Open (password-less) instance reachable off-box with no operator opt-in:
    // the state where the owner fallback would hand an anonymous caller owner
    // identity, so the gate must refuse everything but the lockdown endpoints.
    const app = await buildApp({ locked: false, bindIsLoopback: false, allowOpen: false })
    for (const url of ['/trpc/pots.list', ...ENCODED_PREFIXES]) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(403)
      expect(res.json().error, url).toMatch(/no owner password/)
    }
    await app.close()
  })

  it('leaves a duplicate-slash prefix on the static side, never the router', async () => {
    // `//trpc/...` is not normalised into a router match, so it falls through to
    // the SPA fallback. What matters is that no procedure runs.
    const app = await buildApp({ locked: true })
    const res = await app.inject({ method: 'GET', url: '//trpc/pots.list' })
    expect(res.body).toContain('SPA')
    await app.close()
  })
})

// Fastify's default maxParamLength is 100. tRPC batches every procedure name
// into the one `:path` parameter, so a data-heavy page blows past that and the
// router 404s the whole batch — every query in it fails at once, with the app
// otherwise looking fine. Nothing else in the suite would notice: the raised
// limit only shows up on a URL long enough to need it.
describe('a batched tRPC path longer than the router default still routes', () => {
  it('matches the route rather than 404ing on param length', async () => {
    const app = await buildApp({ locked: true })
    const batch = Array.from({ length: 12 }, (_, i) => `pots.list${i}`).join(',')
    expect(batch.length).toBeGreaterThan(100) // else this asserts nothing

    const res = await app.inject({ method: 'GET', url: `/trpc/${batch}?batch=1` })
    // 401 means the router matched and the gate answered. 404 is the failure
    // this test exists for: the param was rejected before any of that.
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('@fastify/static cannot be walked out of the client root', () => {
  it('refuses to serve a sibling file above the root', async () => {
    const app = await buildApp({ locked: true })
    const traversals = [
      '/../SECRET.txt',
      '/./../SECRET.txt',
      '/foo/../SECRET.txt',
      '/foo/%2E%2E/SECRET.txt',
      '/%2E%2E/SECRET.txt',
      '/..%2fSECRET.txt',
      '/foo/..%2fSECRET.txt',
      '//SECRET.txt',
    ]
    for (const url of traversals) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.body, url).not.toContain(SECRET)
    }
    await app.close()
  })
})
