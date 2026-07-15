// Which database does DATABASE_URL point at? Pure inspection of the env var —
// deliberately free of side effects, unlike `client.ts`, which opens (and for
// PGlite *creates*) the database as soon as it's imported. Tools that must
// decide whether to touch a database at all — the break-glass owner reset (#51)
// — have to answer that question before anything is opened.

const DEFAULT_PGLITE_DIR = './data/pgdata'

/** True if `url` selects a real Postgres server (rather than embedded PGlite). */
export function isServerPgUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))
}

/** The directory an embedded PGlite database lives in. Accepts `pglite:./path`,
 *  `pglite://./path`, or a bare filesystem path; unset means the self-host default. */
export function pgliteDir(url: string | undefined): string {
  if (!url) return DEFAULT_PGLITE_DIR
  const stripped = url.replace(/^pglite:(\/\/)?/, '')
  return stripped.length > 0 ? stripped : DEFAULT_PGLITE_DIR
}

/** A human-readable, credential-free description of the live database, safe to
 *  send to the client (shown on the About screen). Never includes the password
 *  or username from a `postgres://user:pass@host` URL. */
export function describeDatabase(url = process.env.DATABASE_URL): string {
  if (isServerPgUrl(url)) {
    try {
      const parsed = new URL(url!)
      const dbName = parsed.pathname.replace(/^\//, '')
      const location = [parsed.host, dbName].filter(Boolean).join('/')
      return location ? `PostgreSQL (${location})` : 'PostgreSQL'
    } catch {
      return 'PostgreSQL'
    }
  }
  return `PGlite (${pgliteDir(url)})`
}
