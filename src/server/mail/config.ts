/** Transactional email configuration, read from the process environment (#111).
 *
 *  Off by default: a self-host install on a LAN has no mail relay and doesn't
 *  need one — invites are copy-a-link, and the owner's password is reset from
 *  the CLI. Turning it on is what unlocks invite-by-email, address verification
 *  and self-service password reset, which is what a hosted deploy needs.
 *
 *  Env vars:
 *    HEARTH_MAIL_TRANSPORT   off (default) | smtp | log
 *    HEARTH_MAIL_FROM        From: address (required when enabled)
 *    HEARTH_PUBLIC_URL       base URL emailed links point at (required when enabled)
 *    HEARTH_SMTP_HOST        smtp: relay hostname
 *    HEARTH_SMTP_PORT        smtp: port (default 465 implicit, else 587)
 *    HEARTH_SMTP_TLS         smtp: starttls (default) | implicit | none
 *    HEARTH_SMTP_USER        smtp: username (optional — omit for an open relay)
 *    HEARTH_SMTP_PASS        smtp: password
 */

import { isPublicDeploy } from '../auth/startup'

export interface SmtpConfig {
  host: string
  port: number
  /** `starttls` upgrades a plaintext connection and fails if the relay won't;
   *  `implicit` is TLS from the first byte (port 465); `none` is cleartext. */
  tls: 'starttls' | 'implicit' | 'none'
  user: string | null
  pass: string | null
}

export interface MailConfig {
  /** `log` prints the message instead of sending it — development only. */
  transport: 'smtp' | 'log'
  from: string
  /** Origin emailed links are built from, with no trailing slash. */
  publicUrl: string
  smtp: SmtpConfig | null
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] ?? '').trim()
  if (value.length === 0) {
    throw new Error(`HEARTH_MAIL_TRANSPORT is set but ${name} is empty — email can't be sent without it.`)
  }
  return value
}

/** Validate the base URL for emailed links and strip any trailing slash. A
 *  mistyped value here sends every invitee and every reset link to the wrong
 *  host, so reject anything that isn't an absolute http(s) origin. */
function publicUrl(env: NodeJS.ProcessEnv): string {
  const raw = required(env, 'HEARTH_PUBLIC_URL')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`HEARTH_PUBLIC_URL is not a valid URL: "${raw}" (expected e.g. https://hearth.example.com)`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`HEARTH_PUBLIC_URL must be http(s), got "${parsed.protocol}"`)
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
}

function smtpConfig(env: NodeJS.ProcessEnv): SmtpConfig {
  const host = required(env, 'HEARTH_SMTP_HOST')
  const mode = (env.HEARTH_SMTP_TLS ?? 'starttls').trim().toLowerCase()
  if (mode !== 'starttls' && mode !== 'implicit' && mode !== 'none') {
    throw new Error(`unknown HEARTH_SMTP_TLS mode "${mode}" (expected starttls, implicit, or none)`)
  }
  const rawPort = (env.HEARTH_SMTP_PORT ?? '').trim()
  const port = rawPort.length > 0 ? Number(rawPort) : mode === 'implicit' ? 465 : 587
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`HEARTH_SMTP_PORT must be a port number, got "${rawPort}"`)
  }
  const user = env.HEARTH_SMTP_USER?.trim() || null
  const pass = env.HEARTH_SMTP_PASS ?? null
  // A username with no password authenticates as nobody and the relay rejects
  // every send — a failure that only shows up at the first invite. Catch it here.
  if (user !== null && (pass ?? '').length === 0) {
    throw new Error('HEARTH_SMTP_USER is set but HEARTH_SMTP_PASS is empty')
  }
  return { host, port, tls: mode, user, pass }
}

/** The mail configuration, or `null` when email is off (the default). Throws when
 *  it's on but misconfigured, so a broken relay is reported at startup rather
 *  than swallowed at the first invite. */
export function resolveMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const transport = (env.HEARTH_MAIL_TRANSPORT ?? '').trim().toLowerCase()
  if (transport === '' || transport === 'off') return null
  if (transport !== 'smtp' && transport !== 'log') {
    throw new Error(`unknown HEARTH_MAIL_TRANSPORT "${transport}" (expected off, smtp, or log)`)
  }
  // The log transport prints reset and invite tokens in full. That's the point
  // in development, and exactly the leak #176 closed anywhere else.
  if (transport === 'log' && isPublicDeploy(env)) {
    throw new Error(
      'HEARTH_MAIL_TRANSPORT=log writes live invite and password-reset tokens to the server log, ' +
        'which HEARTH_PUBLIC=1 declares unacceptable. Use smtp on a public instance.',
    )
  }

  return {
    transport,
    from: required(env, 'HEARTH_MAIL_FROM'),
    publicUrl: publicUrl(env),
    smtp: transport === 'smtp' ? smtpConfig(env) : null,
  }
}

/** The mail configuration, or `null` when email is off OR misconfigured. What
 *  request-time callers use: the operator already gets the reason at startup,
 *  and a bad relay config should degrade the feature, not 500 the request. */
export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  try {
    return resolveMailConfig(env)
  } catch {
    return null
  }
}

/** Whether the email-backed flows (invite-by-email, verification, password
 *  reset) are available on this instance. */
export function mailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return mailConfig(env) !== null
}
