/** Issue and send an address-confirmation link (#111).
 *
 *  Shared by the "send confirmation email" button and the account-creation paths
 *  that require an address (#199), so all three mint the same token and send the
 *  same message. Never throws: a relay that's down must not fail the sign-up
 *  that triggered it — the address is stored either way and can be confirmed
 *  later from Settings.
 */

import type { DBOrTx } from '../db/client'
import { mailConfig } from './config'
import { trySendMail } from './mailer'
import { verifyEmail } from './templates'
import { issueEmailToken, VERIFY_TTL_MS } from './tokens'

/** Returns whether the mail went out. False when email is off on this instance. */
export async function sendVerificationMail(
  db: DBOrTx,
  u: { id: string; email: string; displayName: string },
): Promise<boolean> {
  const config = mailConfig()
  if (!config) return false
  const token = await issueEmailToken(db, {
    userId: u.id,
    purpose: 'email_verify',
    email: u.email,
    ttlMs: VERIFY_TTL_MS,
  })
  return trySendMail(
    verifyEmail({
      to: u.email,
      origin: config.publicUrl,
      token,
      displayName: u.displayName,
      ttlMs: VERIFY_TTL_MS,
    }),
  )
}
