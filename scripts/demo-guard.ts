// Shared guard for the demo scripts: decide whether a DATABASE_URL target looks
// like the real app.db, so demo mode never migrates/seeds/serves real data.
//
// The check is deliberately case- and separator-insensitive: on win32 the
// filesystem is case-insensitive, so `file:./data/App.db` and `APP.DB` open the
// SAME file as `app.db`. A raw, case-sensitive substring test (the original bug,
// #7) would wave those through and let seedDemo wipe the owner's real database.

/** True if `target` looks like the real app.db (any casing / slash style),
 *  meaning demo mode must refuse to touch it. */
export function looksLikeRealDb(target: string): boolean {
  // Lowercase for case-insensitivity and unify slashes so `data\app.db` and
  // `data/app.db` normalize the same. We keep the original over-broad substring
  // semantics (erring toward refusal) — just no longer casing-dependent.
  const normalized = target.toLowerCase().replace(/\\/g, '/')
  return /app\.db(\?|$)/.test(normalized)
}
