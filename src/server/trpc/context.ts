import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { DB } from '../db/client'
import { db } from '../db/client'
import { parseSessionCookie, serializeSessionCookie } from '../auth/cookies'

export interface Context {
  db: DB
  /** Session token from the request cookie, if any. */
  sessionToken?: string
  /** Set (or clear, with `null`) the session cookie on the response. */
  setSessionCookie?: (token: string | null) => void
}

export function createContext(opts?: CreateFastifyContextOptions): Context {
  const req = opts?.req
  const res = opts?.res
  return {
    db,
    sessionToken: parseSessionCookie(req?.headers.cookie),
    setSessionCookie: res
      ? (token) => {
          void res.header('set-cookie', serializeSessionCookie(token))
        }
      : undefined,
  }
}
