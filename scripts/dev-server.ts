// Local development server (`npm run dev:server`). Runs the real server against
// the real app.db — but opts into OPEN (password-less) access so working on the
// project locally needs no login, even though the server binds 0.0.0.0 (so the
// Vite dev client, and other devices on your LAN, can reach it).
//
// This only affects local development. The production image / `npm start` keep
// the safe default: an open instance on a non-loopback address refuses to serve
// data unless the operator explicitly sets HEARTH_ALLOW_OPEN=1 (see README).
//
// `??=` so an explicit `HEARTH_ALLOW_OPEN=0` in your environment still wins.
process.env.HEARTH_ALLOW_OPEN ??= '1'

// A `tsx watch` dev run isn't a deployment — there's no image to pull and no
// compose file to rebuild — so the update banner and its host commands are noise.
// Only this script is affected; `npm start` and the image still check.
process.env.HEARTH_UPDATE_CHECK ??= 'off'

// A dynamic import (not a static one) so the env var above is set before the
// server module's top-level code runs. `export {}` marks this file as a module,
// which top-level `await` requires.
await import('../src/server/index')

export {}
