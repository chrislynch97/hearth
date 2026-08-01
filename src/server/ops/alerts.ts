/**
 * Outbound alerting for an unattended instance (issue #57).
 *
 * Two deliberately small mechanisms, both opt-in and both best-effort — an
 * alerting failure must never take down the thing it was watching:
 *
 *  - A dead-man's-switch heartbeat (`HEARTH_BACKUP_HEARTBEAT_URL`, e.g. a
 *    Healthchecks.io ping URL). The backup runner pings on success; *silence*
 *    is what raises the alarm, which is the only way to notice a backup that
 *    stopped running rather than one that ran and failed.
 *  - A generic webhook (`HEARTH_ALERT_WEBHOOK`) that receives a JSON event, for
 *    the failures a human should see immediately.
 *
 * Deliberately not an email/SMS/push integration: that's a credential store and
 * a delivery problem, and any of these URLs can be pointed at a service that
 * already solves it.
 */

const TIMEOUT_MS = 10_000

export interface Alert {
  event: string
  message: string
  detail?: Record<string, unknown>
}

function envUrl(raw: string | undefined): string | null {
  const url = (raw ?? '').trim()
  return url.length > 0 ? url : null
}

/** The configured heartbeat ping URL, or null when the heartbeat is off. */
export function heartbeatUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return envUrl(env.HEARTH_BACKUP_HEARTBEAT_URL)
}

/** The configured alert webhook, or null when webhook alerting is off. */
export function alertWebhookUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return envUrl(env.HEARTH_ALERT_WEBHOOK)
}

async function post(url: string, body: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

/** Ping the heartbeat URL. `fail` appends Healthchecks.io's `/fail` suffix so a
 *  run that failed alerts immediately instead of waiting out the grace period.
 *  No-op when unconfigured, and never throws. */
export async function pingHeartbeat(
  outcome: 'success' | 'fail',
  detail?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const base = heartbeatUrl(env)
  if (!base) return
  const url = outcome === 'fail' ? `${base.replace(/\/$/, '')}/fail` : base
  try {
    // The body is free-form text for Healthchecks.io (shown on the check's
    // timeline); a plain POST is also what every other ping service accepts.
    await fetch(url, {
      method: 'POST',
      body: detail ?? outcome,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[hearth] heartbeat ping failed:', err)
  }
}

/** ntfy priority per event; anything unlisted gets its default. */
const PRIORITY: Record<string, string> = {
  backup_failed: 'high',
  offsite_backup_failed: 'high',
}

/** Header values must be printable ASCII — an alert must never fail to send
 *  because of a character in its event name. */
function headerSafe(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, ' ').slice(0, 120)
}

/** Notification hints for the webhook target, as headers so the JSON body stays
 *  the contract: [ntfy](https://ntfy.sh) renders them, every other consumer
 *  ignores headers it doesn't know. ntfy still shows the JSON body as the
 *  message text — this only buys a title and a priority. */
function alertHeaders(alert: Alert): Record<string, string> {
  return {
    'x-title': headerSafe(`Hearth: ${alert.event}`),
    'x-priority': PRIORITY[alert.event] ?? 'default',
  }
}

/** POST an alert to the configured webhook. No-op when unconfigured, and never
 *  throws. The alert is always logged too, so an instance with no webhook still
 *  leaves a trace in the container logs. */
export async function sendAlert(alert: Alert, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  console.error(`[hearth] ALERT ${alert.event}: ${alert.message}`, alert.detail ?? '')
  const url = alertWebhookUrl(env)
  if (!url) return
  try {
    await post(url, JSON.stringify({ ...alert, at: new Date().toISOString() }), alertHeaders(alert))
  } catch (err) {
    console.error('[hearth] alert webhook failed:', err)
  }
}
