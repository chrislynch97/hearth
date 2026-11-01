/** Sending Web Push notifications.
 *
 *  The payload is encrypted to the device, so the push services in between see
 *  only timing and size. Best-effort throughout: a notification is never worth
 *  failing the action that triggered it.
 */

import { eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { pushSubscription } from '../db/schema'
import type { DB } from '../db/client'
import { pushConfig, type PushConfig } from './config'

export interface PushMessage {
  title: string
  body: string
  /** Same-origin path a tap opens, e.g. `/upcoming`. */
  url: string
}

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushTransport = (target: PushTarget, payload: string, config: PushConfig) => Promise<unknown>

const TTL_SECONDS = 24 * 60 * 60
const TIMEOUT_MS = 10_000

const sendViaWebPush: PushTransport = (target, payload, config) =>
  webpush.sendNotification(target, payload, {
    TTL: TTL_SECONDS,
    timeout: TIMEOUT_MS,
    vapidDetails: config,
  })

// The server POSTs to whatever endpoint a browser hands it, so these are the only
// hosts it will accept: anything else would let a member aim it at the LAN.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
]

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

/** The service's way of saying this browser unsubscribed or was reinstalled. */
const isGone = (err: unknown) => {
  const status = (err as { statusCode?: unknown } | null)?.statusCode
  return status === 404 || status === 410
}

const warn = (err: unknown) =>
  console.warn(`[hearth] push failed: ${err instanceof Error ? err.message : 'unknown error'}`)

/** Send to every device a user has opted in. Never throws. Returns how many
 *  devices the push service accepted it for; devices it says are gone are
 *  removed. */
export async function sendPushToUser(
  db: DB,
  userId: string,
  message: PushMessage,
  options: { config?: PushConfig | null; transport?: PushTransport } = {},
): Promise<number> {
  const config = options.config === undefined ? pushConfig() : options.config
  const transport = options.transport ?? sendViaWebPush
  if (!config) return 0

  try {
    const devices = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId))
    const payload = JSON.stringify(message)
    const results = await Promise.allSettled(
      devices.map((device) =>
        transport({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, config),
      ),
    )

    const gone: string[] = []
    let sent = 0
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') sent += 1
      else if (isGone(result.reason)) gone.push(devices[i]!.id)
      else warn(result.reason)
    })
    if (gone.length > 0) await db.delete(pushSubscription).where(inArray(pushSubscription.id, gone))
    return sent
  } catch (err) {
    warn(err)
    return 0
  }
}
