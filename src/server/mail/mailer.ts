/** The transactional email transport (#111).
 *
 *  One send path for all three flows (invite, address verification, password
 *  reset). Deliberately thin: build a message, hand it to the configured
 *  transport, and never let a delivery failure become the caller's problem in a
 *  way that leaks whether an address exists.
 */

import { createTransport, type Transporter } from 'nodemailer'
import { resolveMailConfig, type MailConfig } from './config'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

// Built once per config and reused: nodemailer pools nothing by default, but
// re-creating a transporter per send re-resolves DNS and re-negotiates TLS.
let cached: { config: MailConfig; transporter: Transporter } | null = null

function transporterFor(config: MailConfig): Transporter {
  if (cached && sameConfig(cached.config, config)) return cached.transporter
  const smtp = config.smtp!
  const transporter = createTransport({
    host: smtp.host,
    port: smtp.port,
    // `secure` is TLS from the first byte; `requireTLS` refuses to send in the
    // clear when the relay doesn't offer STARTTLS, so a relay that quietly stops
    // advertising it fails loudly instead of posting reset tokens in plaintext.
    secure: smtp.tls === 'implicit',
    requireTLS: smtp.tls === 'starttls',
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  cached = { config, transporter }
  return transporter
}

function sameConfig(a: MailConfig, b: MailConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Drop the memoised transporter. Tests only — production config is fixed for
 *  the life of the process. */
export function resetMailer(): void {
  cached = null
}

/** Send a message. Throws when email is off or delivery fails — callers that
 *  must not surface either use `trySendMail`. */
export async function sendMail(message: MailMessage, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = resolveMailConfig(env)
  if (!config) throw new Error('email is not configured (HEARTH_MAIL_TRANSPORT)')

  if (config.transport === 'log') {
    // Development only — resolveMailConfig refuses this on a public instance.
    console.log(
      `[hearth] mail (not sent — HEARTH_MAIL_TRANSPORT=log)\n` +
        `  to: ${message.to}\n  subject: ${message.subject}\n\n${message.text}\n`,
    )
    return
  }

  await transporterFor(config).sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

/** Send a message, swallowing any failure. Returns whether it went out.
 *
 *  Used by every flow whose response must not depend on the outcome: a password
 *  reset that 500s on an unknown address, or succeeds only for a deliverable
 *  one, is an account-enumeration oracle. The failure is logged (without the
 *  message body, which carries the token) so the operator can still see it. */
export async function trySendMail(message: MailMessage, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  try {
    await sendMail(message, env)
    return true
  } catch (err) {
    console.error(`[hearth] failed to send "${message.subject}":`, err)
    return false
  }
}
