import { useState, type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { BrowserRouter } from 'react-router-dom'
import { trpc } from './trpc'
import { theme } from './theme'
import { ErrorBoundary } from './ErrorState'
import { createQueryClient } from './queryClient'

/** All app-wide context providers in one place: tRPC + React Query data layer,
 *  Mantine theming + notifications, the error boundary, and the router. Kept out
 *  of `main.tsx` so the entry point is just CSS imports and the render call. */
export function AppProviders({ children }: { children: ReactNode }) {
  // Lazy `useState` init so each client is created exactly once for the app's
  // lifetime (TanStack Query's recommended pattern), never rebuilt on re-render.
  const [queryClient] = useState(createQueryClient)
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: '/trpc', transformer: superjson })] }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          <ErrorBoundary>
            <BrowserRouter>{children}</BrowserRouter>
          </ErrorBoundary>
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
