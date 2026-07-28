// ---------------------------------------------------------------------------
// Postgres port — see issue #25.
// ---------------------------------------------------------------------------
// Column names are kept byte-identical to the old SQLite schema. Type choices:
//   * Every `*At` column is `timestamptz` (mode: 'date') — a real Postgres
//     timestamp, not an epoch-millis integer. This is the long-term-correct
//     storage type (psql readability, SQL date math, BI tooling) and also
//     sidesteps the INT4 overflow that epoch-millis (~1.75e12) would hit. The
//     app works with JS `Date` objects end to end; they cross tRPC as real
//     Dates via the superjson transformer (see trpc/trpc.ts + client/main.tsx).
//     The JSON export/backup format deliberately stays epoch-millis NUMBERS
//     (converted at the snapshot boundary, db/snapshot.ts) so exports remain
//     engine-agnostic and older SQLite exports still import unchanged.
//   * Booleans stay `integer` 0/1 and JSON stays `text`, exactly as under
//     SQLite — the app reads/writes them that way throughout, so keeping the
//     representation avoids a stack-wide churn for no near-term gain.
// ---------------------------------------------------------------------------
// Split by domain, barrel-exported: `../db/schema` still resolves to every
// table, and drizzle-kit reads the folder (see drizzle.config.ts). The grouping
// is acyclic — spending → budget → tenancy, one direction.

export * from './tenancy'
export * from './budget'
export * from './spending'
export * from './income'
export * from './networth'
export * from './audit'
