import { useState, type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, httpLink, splitLink } from '@trpc/client'
import superjson from 'superjson'
import { trpc } from './trpc'
import { theme } from './theme'
import { ErrorBoundary } from './ErrorState'
import { createQueryClient } from './queryClient'

/** All app-wide context providers in one place: tRPC + React Query data layer,
 *  Mantine theming + notifications, and the error boundary. Kept out of `main.tsx`
 *  so the entry point is just CSS imports and the render call. The router itself
 *  mounts inside `App` once the auth gates pass, so it lives below these. */
export function AppProviders({ children }: { children: ReactNode }) {
  // Lazy `useState` init so each client is created exactly once for the app's
  // lifetime (TanStack Query's recommended pattern), never rebuilt on re-render.
  const [queryClient] = useState(createQueryClient)
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          // Send `auth.*` calls unbatched, on their own HTTP request. The
          // open-on-public guard (server index.ts) gates per HTTP request: a batch
          // mixing a blocked procedure (e.g. bootstrap.context) with a public one
          // (auth.status) 403s as a whole, so the SPA could never even read
          // auth.status to discover it should show a first-run password screen.
          // Keeping auth.status / auth.setPassword off the batch lets them reach
          // the gate's allowlist and drive first-run recovery (#34).
          condition: (op) => op.path.startsWith('auth.'),
          true: httpLink({ url: '/trpc', transformer: superjson }),
          false: httpBatchLink({ url: '/trpc', transformer: superjson }),
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          <ErrorBoundary>{children}</ErrorBoundary>
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
