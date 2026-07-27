/** Message bodies for the three transactional emails (#111).
 *
 *  Every mail ships both a plain-text and an HTML part: text is what a terminal
 *  client, a screen reader and a spam filter all read well, HTML is what most
 *  people see. The HTML is deliberately primitive — inline styles and a table-free
 *  layout — because email clients support roughly none of modern CSS.
 */

import type { MailMessage } from './mailer'
import { inviteLink, resetPasswordLink, verifyEmailLink } from '../../shared/links'

/** Escape text interpolated into the HTML part. Household and display names are
 *  user-supplied, so an unescaped `<` would break the markup at best. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A one-action email: a line of context, a button, and the raw URL as a
 *  fallback for clients that strip links. */
function layout(opts: { heading: string; body: string; action: string; url: string; footer: string }): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#22201d;max-width:520px">
  <p style="font-size:20px;font-weight:600;margin:0 0 16px">${esc(opts.heading)}</p>
  <p style="margin:0 0 20px">${opts.body}</p>
  <p style="margin:0 0 20px"><a href="${esc(opts.url)}" style="background:#4a6b4f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${esc(opts.action)}</a></p>
  <p style="margin:0 0 20px;font-size:13px;color:#6b6660">Or paste this into your browser:<br><span style="word-break:break-all">${esc(opts.url)}</span></p>
  <p style="margin:0;font-size:13px;color:#6b6660">${esc(opts.footer)}</p>
</div>`
}

/** Plural-safe "7 days" / "1 hour" for the expiry line. */
function expiresIn(ms: number): string {
  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours >= 48) return `${Math.round(hours / 24)} days`
  if (hours === 1) return '1 hour'
  return `${hours} hours`
}

export function inviteEmail(opts: {
  to: string
  origin: string
  token: string
  householdName: string
  role: string
  invitedBy: string | null
  ttlMs: number
}): MailMessage {
  const url = inviteLink(opts.origin, opts.token)
  const who = opts.invitedBy ? `${opts.invitedBy} has invited you` : "You've been invited"
  const validity = `The link works once and expires in ${expiresIn(opts.ttlMs)}. If you weren't expecting this, you can ignore it.`

  return {
    to: opts.to,
    subject: `You're invited to join ${opts.householdName} on Hearth`,
    text: `${who} to join the household "${opts.householdName}" on Hearth as ${opts.role}.\n\nCreate your account:\n${url}\n\n${validity}\n`,
    html: layout({
      heading: `Join ${opts.householdName} on Hearth`,
      body: `${esc(who)} to join the household <b>${esc(opts.householdName)}</b> as ${esc(opts.role)}.`,
      action: 'Create your account',
      url,
      footer: validity,
    }),
  }
}

export function verifyEmail(opts: { to: string; origin: string; token: string; displayName: string; ttlMs: number }): MailMessage {
  const url = verifyEmailLink(opts.origin, opts.token)
  const validity = `The link expires in ${expiresIn(opts.ttlMs)}. If you didn't add this address to a Hearth account, you can ignore this email.`

  return {
    to: opts.to,
    subject: 'Confirm your email address for Hearth',
    text: `Hi ${opts.displayName},\n\nConfirm this address so it can be used to recover your Hearth account:\n${url}\n\n${validity}\n`,
    html: layout({
      heading: 'Confirm your email address',
      body: `Hi ${esc(opts.displayName)} — confirm this address so it can be used to recover your Hearth account.`,
      action: 'Confirm address',
      url,
      footer: validity,
    }),
  }
}

export function passwordResetEmail(opts: {
  to: string
  origin: string
  token: string
  displayName: string
  ttlMs: number
}): MailMessage {
  const url = resetPasswordLink(opts.origin, opts.token)
  const validity = `The link works once and expires in ${expiresIn(opts.ttlMs)}. If you didn't ask to reset your password, ignore this email — your password hasn't changed.`

  return {
    to: opts.to,
    subject: 'Reset your Hearth password',
    text: `Hi ${opts.displayName},\n\nSomeone asked to reset the password on your Hearth account. Choose a new one:\n${url}\n\n${validity}\n`,
    html: layout({
      heading: 'Reset your password',
      body: `Hi ${esc(opts.displayName)} — someone asked to reset the password on your Hearth account.`,
      action: 'Choose a new password',
      url,
      footer: validity,
    }),
  }
}
