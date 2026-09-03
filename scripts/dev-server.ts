// Local development server (`npm run dev:server`). Runs the real server against
// the DEV database — ./data/dev, a disposable PGlite folder full of generated
// fake households (src/server/db/dev.ts). It is seeded on first run and never
// touches the real database, so there is no "careful, this one is live" mode to
// remember: `npm start` is the only way to serve a real database.
//
//   npm run dev:server           → serve ./data/dev (seeds it on first run)
//   npm run dev:server -- --seed → force a fresh re-seed before serving
//
// Unlike demo mode the dev instance is LOCKED (every account has a password):
// its extra households are only reachable through the household switcher, which
// needs a real session. Log in as DEV_LOGIN with DEV_PASSWORD.

import { looksLikeRealDb } from './demo-guard'

const DEFAULT_DEV_URL = 'pglite:./data/dev'
const reseed = process.argv.includes('--seed')
const forced = process.argv.includes('--force')

// Force the dev path unconditionally (do NOT defer to an inherited DATABASE_URL
// with `??=`): a DATABASE_URL left pointing at the real database would otherwise
// be migrated, re-seeded (which wipes every table) and served — silently
// destroying real financial data. `--force` lets an explicit override stand.
if (!forced) process.env.DATABASE_URL = DEFAULT_DEV_URL

// The seeded dev instance is locked (every account has a password), which makes
// this inert. It matters for the one dev run that isn't: `--force` at an empty
// database, to walk the setup wizard. Without it an open instance on the default
// 0.0.0.0 bind refuses to serve anything. `??=` so an explicit 0 still wins.
process.env.HEARTH_ALLOW_OPEN ??= '1'

// A `tsx watch` dev run isn't a deployment — there's no image to pull and no
// compose file to rebuild — so the update banner and its host commands are noise.
// Only this script is affected; `npm start` and the image still check.
process.env.HEARTH_UPDATE_CHECK ??= 'off'

// Belt-and-suspenders guard mirroring the demo scripts: refuse to touch anything
// that still looks like the real database.
const target = process.env.DATABASE_URL ?? DEFAULT_DEV_URL
if (looksLikeRealDb(target) && !forced) {
  console.error(
    `Refusing to run dev mode against "${target}" — that looks like the real database.\n` +
      `Unset DATABASE_URL to use the default (${DEFAULT_DEV_URL}), point it at a dev/test file, or pass --force.`,
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const { runMigrations } = await import('../src/server/db/migrate')
  const { db } = await import('../src/server/db/client')
  const { seedDev, hasDevData, DEV_LOGIN, DEV_PASSWORD } = await import('../src/server/db/dev')

  await runMigrations()
  // A --force run was pointed somewhere deliberately, so leave it alone unless
  // asked: that's how you get an empty database to walk the setup wizard on.
  if (reseed || (!forced && !(await hasDevData(db)))) {
    console.log(`[dev] populating ${process.env.DATABASE_URL}`)
    await seedDev(db)
  } else {
    console.log(`[dev] using existing data in ${process.env.DATABASE_URL} (pass --seed to refresh)`)
  }
  if (await hasDevData(db)) console.log(`[dev] log in as ${DEV_LOGIN} / ${DEV_PASSWORD}`)

  // Boot the real server. It re-uses the same DATABASE_URL we set above.
  await import('../src/server/index')
}

main().catch((err) => {
  console.error('[dev] failed:', err)
  process.exit(1)
})
