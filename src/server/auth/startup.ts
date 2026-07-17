/** Startup safety assertions for an internet-facing deployment (#55).
 *
 *  Config mistakes are the most likely failure mode on deploy day — a stray
 *  `HEARTH_ALLOW_OPEN=1` left in a compose file, or open registration still
 *  switched on from a LAN install. The HTTP gate (index.ts) already fails closed
 *  at request time, but only for the states it can see; these checks catch the
 *  config itself, at boot, before we ever accept a connection.
 *
 *  Pure and side-effect-free (like gate.ts) so they can be unit-tested without
 *  starting the server. index.ts decides what to do with the result.
 */

/** Whether the operator has declared this instance internet-facing.
 *
 *  This can't be inferred from NODE_ENV: the Docker image sets
 *  NODE_ENV=production for every deployment, including the documented
 *  password-less home-LAN one (`HEARTH_ALLOW_OPEN=1 docker compose up -d`), so
 *  keying on it would refuse to boot the exact setup the README recommends.
 *  "Bound to 0.0.0.0" doesn't distinguish them either — that's every container.
 *  So the operator says so explicitly, and a public deploy turns the warnings
 *  below into a refusal to boot. Only the exact string '1' opts in, mirroring
 *  HEARTH_ALLOW_OPEN. */
export function isPublicDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HEARTH_PUBLIC === '1'
}

export interface StartupSafetyInput {
  /** The address we're about to bind, for the message text. */
  host: string
  /** Whether that bind is unreachable from off-box (see gate.ts). */
  bindIsLoopback: boolean
  /** HEARTH_ALLOW_OPEN=1 — the operator disarmed the open-on-public guard. */
  allowOpen: boolean
  /** Whether an owner password is set (`isInstanceLocked`). */
  locked: boolean
  /** Whether anyone who can reach the instance can create an account. */
  allowOpenRegistration: boolean
}

/** Unsafe-configuration problems found at boot, as operator-facing messages.
 *
 *  Empty means nothing looked wrong. On a public deploy (`isPublicDeploy`) the
 *  caller refuses to boot on any of these; elsewhere it warns and carries on,
 *  because each state is legitimate on a trusted LAN.
 *
 *  Deliberately NOT a problem: an unlocked instance on its own. A fresh public
 *  install has no owner password until someone visits the UI and sets one, so
 *  failing on that would make first-run setup impossible. The gate already
 *  serves nothing but the lock-it-down endpoints in that state.
 */
export function startupSafetyProblems(input: StartupSafetyInput): string[] {
  const problems: string[] = []

  // HEARTH_ALLOW_OPEN only does anything on a non-loopback bind, and what it
  // does is switch off the guard that stops anonymous callers being resolved as
  // the owner. Flagged even when an owner password is currently set: the flag
  // has no legitimate purpose on a public box, and clearing that password later
  // would silently throw the instance open with nothing left to catch it.
  if (input.allowOpen && !input.bindIsLoopback) {
    problems.push(
      input.locked
        ? `HEARTH_ALLOW_OPEN=1 is set while bound to ${input.host}. It has no effect right now ` +
            '(an owner password is set), but it disarms the guard that would otherwise stop an ' +
            'anonymous caller acting as the owner if that password were ever cleared. Unset it.'
        : `HEARTH_ALLOW_OPEN=1 is set while bound to ${input.host} and no owner password is set — ` +
            'anyone who can reach this address has full owner access. Unset it and set an owner password.',
    )
  }

  // Open registration with no owner password: the anonymous-owner fallback is
  // live AND strangers can mint accounts. Can't be a fresh install — open
  // registration defaults off, so someone turned it on.
  if (input.allowOpenRegistration && !input.locked) {
    problems.push(
      'Open registration is enabled but no owner password is set — anyone who can reach this ' +
        'instance can create an account, and until a password is set every anonymous request is ' +
        'treated as the owner. Set an owner password, or turn registration off.',
    )
  }

  return problems
}
