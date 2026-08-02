// Break-glass containment (#248) — end every session on the instance, so
// everyone signs in again.
//
//   npm run end-all-sessions                          (from a source checkout)
//   docker compose exec hearth node dist/end-all-sessions.js   (Docker)
//   … --yes                                           (skip the confirmation)
//
// The Docker form works because `build:end-all-sessions` bundles this file into
// dist/ — the runtime image has no npm, no tsx and no scripts/ dir (#135).
//
// Settings → System → Sign everyone out does the same thing with a running app.
// This is the route that survives one not starting, and the only route at all on
// the embedded PGlite database, which is in-process and has no SQL prompt to
// reach it from. Requires shell access to the box, which already equals full
// access to the database.
//
// The target follows the same DATABASE_URL rules as the server (unset ⇒ the
// embedded PGlite dir ./data/pgdata; postgres:// ⇒ a real server). It says which
// database it resolved and makes you confirm before it writes — an incident is
// the worst time to sign out the wrong instance.
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { describeDatabase, isServerPgUrl, pgliteDir } from '../src/server/db/target'

const url = process.env.DATABASE_URL
const label = describeDatabase(url)
const assumeYes = process.argv.slice(2).includes('--yes')

// A PGlite dir that doesn't exist yet is the "which database is this?" case: the
// db client would happily *create* an empty one, and we'd then report no sessions
// ended — leaving the operator to believe an instance is contained when it isn't.
// (A postgres:// URL can't be checked without connecting; there, a wrong host
// simply fails to connect.)
if (!isServerPgUrl(url)) {
  const dir = pgliteDir(url)
  if (!existsSync(dir)) {
    console.error(
      `No database found at "${dir}".\n` +
        `Run this from your instance's directory, or set DATABASE_URL to point at it — ` +
        `signing out the wrong database would leave the real one untouched.`,
    )
    process.exit(1)
  }
}

/** Ask once on the terminal. `--yes` skips this, for a scripted response. */
function confirm(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve, reject) => {
    // Input can end (^D, a closed pipe) with the question outstanding, which
    // would otherwise hang here for good rather than answering.
    const onClose = () => reject(new Error('Input ended before the prompt was answered.'))
    rl.once('close', onClose)
    rl.question(question, (answer) => {
      rl.off('close', onClose)
      rl.close()
      resolve(answer)
    })
  })
}

async function main(): Promise<void> {
  console.log(`This will end every session on: ${label}`)
  console.log('Everyone signs in again, including you. Nothing else is changed — no password, no data.')

  if (!assumeYes) {
    if (!process.stdin.isTTY) {
      console.error(
        'This needs a terminal to confirm on. Pass --yes to skip the prompt, ' +
          'or in Docker run `docker compose exec hearth node dist/end-all-sessions.js`.',
      )
      process.exit(1)
    }
    const answer = await confirm('Continue? Type "yes" to proceed: ')
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Cancelled — nothing was changed.')
      return
    }
  }

  // Import the db client only now: it opens (and for PGlite creates) the database
  // on import, so an abandoned run must not have touched anything.
  const { db, closeDb } = await import('../src/server/db/client')
  const { endAllSessionsFromConsole } = await import('../src/server/auth/end-all-sessions')
  try {
    const count = await endAllSessionsFromConsole(db)
    console.log(`\n${count} ${count === 1 ? 'session' : 'sessions'} ended. Everyone signs in again.`)
  } finally {
    await closeDb()
  }
}

main().catch((err) => {
  console.error(`\nCouldn't end sessions: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
