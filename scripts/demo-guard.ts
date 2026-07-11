// Shared guard for the demo scripts: decide whether a DATABASE_URL target looks
// like the real production database, so demo mode never migrates/seeds/serves
// real data. It refuses:
//   * the legacy SQLite file `app.db` (pre-Postgres installs / stale env vars), and
//   * the embedded Postgres (PGlite) data dir `pgdata` — the current default, and
//   * any real Postgres server URL (`postgres://` / `postgresql://`) — a demo
//     must never point at a live server.
//
// The check is deliberately case- and separator-insensitive: on win32 the
// filesystem is case-insensitive, so `App.db`/`PgData` open the SAME path. A
// raw, case-sensitive substring test (the original bug, #7) would wave those
// through and let seedDemo wipe the owner's real database.

/** True if `target` looks like the real production database (any casing / slash
 *  style), meaning demo mode must refuse to touch it. */
export function looksLikeRealDb(target: string): boolean {
  const normalized = target.toLowerCase().replace(/\\/g, '/')
  // A real Postgres server is never a demo target.
  if (/^postgres(ql)?:\/\//.test(normalized)) return true
  // The legacy SQLite file, or the embedded PGlite data dir. Erring toward
  // refusal (over-broad substring) is deliberate.
  return /app\.db(\?|$)/.test(normalized) || /pgdata(\/|$)/.test(normalized)
}
