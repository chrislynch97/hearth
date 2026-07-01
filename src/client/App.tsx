import { Center, Loader } from '@mantine/core'
import { Route, Routes } from 'react-router-dom'
import { trpc } from './trpc'
import { SetupWizard } from './setup/SetupWizard'
import { AppLayout } from './layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { PotsPage } from './pages/PotsPage'
import { OutgoingsPage } from './pages/OutgoingsPage'
import { FundingPage } from './pages/FundingPage'

export function App() {
  const ctx = trpc.bootstrap.context.useQuery()

  if (ctx.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  if (ctx.data?.needsSetup) {
    return (
      <SetupWizard
        householdName={ctx.data.household?.displayName ?? 'My Household'}
        currencyCode={ctx.data.household?.currencyCode ?? 'GBP'}
      />
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pots" element={<PotsPage />} />
        <Route path="outgoings" element={<OutgoingsPage />} />
        <Route path="funding" element={<FundingPage />} />
      </Route>
    </Routes>
  )
}
