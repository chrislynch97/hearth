/** Web Push configuration, read from the process environment.
 *
 *  Off by default: sending a notification means this server calling Google's,
 *  Apple's or Mozilla's push service, and a self-host install shouldn't make
 *  external requests it never asked for.
 *
 *  Env vars (all three, or none):
 *    HEARTH_VAPID_PUBLIC_KEY   from `npx web-push generate-vapid-keys`
 *    HEARTH_VAPID_PRIVATE_KEY  the secret half; changing it drops every device
 *    HEARTH_VAPID_SUBJECT      mailto: or https: contact for the push services
 */

export interface PushConfig {
  publicKey: string
  privateKey: string
  subject: string
}

const NAMES = ['HEARTH_VAPID_PUBLIC_KEY', 'HEARTH_VAPID_PRIVATE_KEY', 'HEARTH_VAPID_SUBJECT'] as const

const decodedLength = (key: string) => Buffer.from(key, 'base64url').length

/** The push configuration, or `null` when it's off (the default). Throws when
 *  it's half-set or malformed, so that's reported at startup rather than looking
 *  exactly like a feature that's switched off. */
export function resolvePushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const [publicKey, privateKey, subject] = NAMES.map((name) => (env[name] ?? '').trim()) as [string, string, string]
  const missing = NAMES.filter((name) => (env[name] ?? '').trim().length === 0)
  if (missing.length === NAMES.length) return null
  if (missing.length > 0) {
    throw new Error(`Web Push is half-configured: ${missing.join(', ')} is empty. Set all three, or none.`)
  }
  if (decodedLength(publicKey) !== 65) {
    throw new Error('HEARTH_VAPID_PUBLIC_KEY is not a VAPID public key (generate one with: npx web-push generate-vapid-keys)')
  }
  if (decodedLength(privateKey) !== 32) {
    throw new Error('HEARTH_VAPID_PRIVATE_KEY is not a VAPID private key (generate one with: npx web-push generate-vapid-keys)')
  }
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    throw new Error(`HEARTH_VAPID_SUBJECT must start with mailto: or https://, got "${subject}"`)
  }
  return { publicKey, privateKey, subject }
}

/** As `resolvePushConfig`, but `null` when misconfigured too. What request-time
 *  callers use: the operator already got the reason at startup. */
export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  try {
    return resolvePushConfig(env)
  } catch {
    return null
  }
}
