import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

// Phase 1 smoke test: confirms Mantine + Testing Library are wired. A full <App/>
// render test (with a mocked tRPC provider) is deferred to Phase 2.
function Shell({ children }: { children: ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>
}

describe('App shell', () => {
  it('renders the product title', () => {
    render(
      <Shell>
        <h4>Hearthledger</h4>
      </Shell>,
    )
    expect(screen.getByText('Hearthledger')).toBeInTheDocument()
  })
})
