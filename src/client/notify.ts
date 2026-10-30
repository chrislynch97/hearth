import { toast } from 'sonner'

/**
 * Global toast helpers (issue #33).
 *
 * Client mutation failures used to be handled ad-hoc: some forms rendered an
 * inline alert, many fire-and-forget callsites swallowed the rejection and
 * showed the user nothing. These helpers give every mutation one consistent
 * feedback surface. The bulk of the wiring lives in `queryClient.ts`, where a
 * global `MutationCache.onError` routes *every* failed mutation through
 * `notifyError`, so a background archive/invalidate that fails off-screen is no
 * longer silent.
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
  const description = messageOf(error)
  if (isConflictError(error)) {
    toast.warning(opts?.title ?? 'Changed by someone else', { description, duration: 8000 })
    return
  }
  toast.error(opts?.title ?? 'Something went wrong', { description, duration: 5000 })
}

/** Green confirmation toast for a completed action. */
export function notifySuccess(message: string, opts?: { title?: string }): void {
  toast.success(opts?.title ?? message, {
    description: opts?.title ? message : undefined,
    duration: 3000,
  })
}
