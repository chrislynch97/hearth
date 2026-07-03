import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { DB } from '../db/client'
import { db } from '../db/client'
import { parseSessionCookie, serializeSessionCookie } from '../auth/cookies'

export interface Context {
  db: DB
  /** Session token from the request cookie, if any. */
  sessionToken?: string
  /** Client identifier (IP) for rate limiting. */
  clientKey?: string
  /** Set (or clear, with `null`) the session cookie on the response. */
  setSessionCookie?: (token: string | null) => void
}

function isHttps(req: CreateFastifyContextOptions['req'] | undefined): boolean {
  if (process.env.HEARTH_SECURE_COOKIES === '1') return true
  return req?.headers['x-forwarded-proto'] === 'https' || req?.protocol === 'https'
}

export function createContext(opts?: CreateFastifyContextOptions): Context {
  const req = opts?.req
  const res = opts?.res
  const secure = isHttps(req)
  return {
    db,
    sessionToken: parseSessionCookie(req?.headers.cookie),
    clientKey: req?.ip,
    setSessionCookie: res
      ? (token) => {
          void res.header('set-cookie', serializeSessionCookie(token, secure))
        }
      : undefined,
  }
}
