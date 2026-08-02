/** True when `err` is a UNIQUE / PRIMARY KEY constraint violation. drizzle wraps
 *  the driver error, so walk the `cause` chain rather than inspecting only the
 *  top error.
 *
 *  Lets a concurrent check-then-insert race (two sign-ups claiming the same
 *  username between the "is it taken?" read and the write) be turned back into a
 *  friendly "already taken" message instead of surfacing as a raw 500. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e != null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true // Postgres: unique_violation
  }
  return false
}
