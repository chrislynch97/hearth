// Break-glass owner password reset (#51) — the recovery path for a locked-out
// instance owner, who by design has no one above them to reset their password.
//
//   npm run reset-owner-password                     (from a source checkout)
//   docker exec -it <container> node dist/reset-owner-password.js   (Docker)
//
// The Docker form works because `build:reset-password` bundles this file into
// dist/ — the runtime image has no npm, no tsx and no scripts/ dir (#135).
//
// Prompts for a new password, clears the owner's MFA enrolment, and revokes their
// sessions. Requires shell access to the box, which already equals full access to
// the database — this grants an attacker nothing they couldn't take with a SQL
// prompt; it just makes legitimate recovery survivable.
//
// The target follows the same DATABASE_URL rules as the server (unset ⇒ the
// embedded PGlite dir ./data/pgdata; postgres:// ⇒ a real server). Because a reset
// aimed at the wrong database is a wasted recovery on a live lockout, the script
// says which database it resolved and makes you confirm before it writes.
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { describeDatabase, isServerPgUrl, pgliteDir } from '../src/server/db/target'

const url = process.env.DATABASE_URL
const label = describeDatabase(url)

// A PGlite dir that doesn't exist yet is the "which database is this?" case: the
// db client would happily *create* an empty one, and we'd then report no owner to
// reset — leaving the operator to conclude their data is gone. Refuse first, while
// nothing has been opened. (A postgres:// URL can't be checked without connecting;
// there, a wrong host simply fails to connect.)
if (!isServerPgUrl(url)) {
  const dir = pgliteDir(url)
  if (!existsSync(dir)) {
    console.error(
      `No database found at "${dir}".\n` +
        `Run this from your instance's directory, or set DATABASE_URL to point at it — ` +
        `resetting the wrong database would leave you just as locked out.`,
    )
    process.exit(1)
  }
}

if (!process.stdin.isTTY) {
  console.error(
    'This needs a terminal to prompt for the new password ' +
      '(in Docker, run `docker exec -it <container> node dist/reset-owner-password.js`).',
  )
  process.exit(1)
}

/** The terminal, as one readline interface for the whole run. It has to be one:
 *  an interface opened per question swallows whatever the previous one buffered,
 *  so the answer to a later prompt can vanish and leave it waiting forever.
 *
 *  `ask(…, true)` doesn't echo what's typed — a password must not land on screen,
 *  or in a scrollback someone else reads. */
function openConsole() {
  let muted = false
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding)
      callback()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })

  const ask = (question: string, hidden = false): Promise<string> =>
    new Promise((resolve, reject) => {
      // Input can end (^D, a closed pipe) with a question outstanding, which
      // would otherwise hang here for good rather than answering.
      const onClose = () => reject(new Error('Input ended before the prompt was answered.'))
      rl.once('close', onClose)
      rl.question(question, (answer) => {
        rl.off('close', onClose)
        muted = false
        if (hidden) process.stdout.write('\n') // the muted Enter never printed one
        resolve(answer)
      })
      muted = hidden
    })

  return { ask, close: () => rl.close() }
}

async function main(): Promise<void> {
  const { ask, close } = openConsole()
  try {
    await reset(ask)
  } finally {
    close()
  }
}

/** Confirm the target, take the new password twice, and do the reset. */
async function reset(ask: (question: string, hidden?: boolean) => Promise<string>): Promise<void> {
  console.log(`This will reset the owner password on: ${label}`)
  console.log('It also clears the owner’s two-factor enrolment and signs out all of their sessions.')
  const confirmed = await ask('Continue? Type "yes" to proceed: ')
  if (confirmed.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled — nothing was changed.')
    return
  }

  const password = await ask('New owner password: ', true)
  const again = await ask('Confirm new password: ', true)
  if (password !== again) {
    console.error('Those passwords don’t match — nothing was changed.')
    process.exitCode = 1
    return
  }

  // Import the db client only now: it opens (and for PGlite creates) the database
  // on import, so an abandoned run must not have touched anything.
  const { db, closeDb } = await import('../src/server/db/client')
  const { resetOwnerCredentials } = await import('../src/server/auth/reset-owner')
  try {
    const result = await resetOwnerCredentials(db, password)
    console.log(`\nPassword reset for ${result.displayName} (@${result.username}).`)
    if (result.mfaCleared) console.log('Two-factor authentication was cleared — set it up again after signing in.')
    console.log('Any sessions they had are signed out. Sign in with the new password.')
  } finally {
    await closeDb()
  }
}

main().catch((err) => {
  console.error(`\nReset failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
