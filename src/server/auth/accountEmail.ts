/** Whether accounts on this instance must carry an email address (#199).
 *
 *  Recovery is the reason. A member of more than one household can't be reset by
 *  an admin — `access.resetMemberPassword` refuses, because resetting lets the
 *  resetter learn the password and so hand one household's admin the keys to
 *  another. That leaves self-service email reset as the only route, and an
 *  account with no address has no route at all: not the CLI (that's the instance
 *  owner only), not an admin, not themselves. Only SQL on the box.
 *
 *  So it's required where accounts belong to people who can't get to the box —
 *  which `HEARTH_PUBLIC=1` already declares. Reusing it avoids a second knob for
 *  the same fact, and it's a deliberate, startup-fatal declaration rather than
 *  something inferred. A LAN self-host is untouched: username-only accounts stay
 *  legal there, and the owner resets from a shell.
 *
 *  Note this only governs *account creation*. Existing addressless accounts keep
 *  working and are nudged in the UI, never locked out.
 */
import { isPublicDeploy } from './startup'

export function emailRequiredForAccounts(env: NodeJS.ProcessEnv = process.env): boolean {
  return isPublicDeploy(env)
}

/** The error every creation path raises when an address is required and absent.
 *  One message so register and invite-accept read identically to the person. */
export const EMAIL_REQUIRED_MESSAGE =
  'An email address is required on this instance — it is the only way to recover your account if you lose your password.'
