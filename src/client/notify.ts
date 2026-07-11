import { notifications } from '@mantine/notifications'

/**
 * Global toast helpers (issue #33).
 *
 * Client mutation failures used to be handled ad-hoc: some forms rendered an
 * inline `<Alert>`, many fire-and-forget callsites swallowed the rejection and
 * showed the user nothing. These helpers give every mutation one consistent
 * feedback surface. The bulk of the wiring lives in `main.tsx`, where a global
 * `MutationCache.onError` routes *every* failed mutation through `notifyError`,
 * so a background archive/invalidate that fails off-screen is no longer silent.
 */

/**
 * A concurrent edit moved the row on since the client loaded it, so the
 * optimistic-lock guard refused the write (see server `throwStaleWrite`). These
 * get a distinct, calmer toast telling the user to reload rather than the red
 * "something went wrong" treatment.
 */
export function isConflictError(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null)?.data?.code === 'CONFLICT'
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  return 'Something went wrong. Please try again.'
}

/** Red (or amber, for conflicts) error toast. Safe to pass any thrown value. */
export function notifyError(error: unknown, opts?: { title?: string }): void {
  const conflict = isConflictError(error)
  notifications.show({
    color: conflict ? 'yellow' : 'red',
    title: opts?.title ?? (conflict ? 'Changed by someone else' : 'Something went wrong'),
    message: messageOf(error),
    autoClose: conflict ? 8000 : 5000,
  })
}

/** Green confirmation toast for a completed action. */
export function notifySuccess(message: string, opts?: { title?: string }): void {
  notifications.show({
    color: 'teal',
    title: opts?.title,
    message,
    autoClose: 3000,
  })
}
