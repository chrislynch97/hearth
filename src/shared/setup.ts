/** A household needs setup until it exists and has a setupCompletedAt timestamp. */
export function needsSetup(hh: { setupCompletedAt?: number | null } | undefined): boolean {
  return !hh || hh.setupCompletedAt == null
}
