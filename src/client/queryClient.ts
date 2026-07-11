import { QueryClient, MutationCache } from '@tanstack/react-query'
import { notifyError, isConflictError } from './notify'

/**
 * The app-wide QueryClient, with one global mutation error handler (issue #33).
 *
 * Every failed mutation routes through here, so a fire-and-forget callsite or a
 * background invalidation that used to swallow its rejection now surfaces a
 * toast. A callsite that wants bespoke handling can opt out per-mutation with
 * `meta: { suppressErrorToast: true }`.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.['suppressErrorToast']) return
        notifyError(error)
        // A stale-write conflict means the client is holding old data; refetch
        // everything so open forms re-seed with the latest version.
        if (isConflictError(error)) void client.invalidateQueries()
      },
    }),
  })
  return client
}
