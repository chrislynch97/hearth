import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { BrowserRouter } from 'react-router-dom'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import { trpc } from './trpc'
import { theme } from './theme'
import { App } from './App'
import { ErrorBoundary } from './ErrorState'

function Root() {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: '/trpc' })] }),
  )
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <ErrorBoundary>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ErrorBoundary>
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
