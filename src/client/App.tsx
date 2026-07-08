import { Center, Loader } from '@mantine/core'
import { Route, Routes } from 'react-router-dom'
import { trpc } from './trpc'
import { ConnectionError } from './ErrorState'
import { LoginGate } from './LoginGate'
import { AcceptInvite } from './AcceptInvite'
import { SetupWizard } from './setup/SetupWizard'
import { AppLayout } from './layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { PotsPage } from './pages/PotsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { OutgoingsPage } from './pages/OutgoingsPage'
import { FundingPage } from './pages/FundingPage'
import { SpendingPage } from './pages/SpendingPage'
import { CatchupPage } from './pages/CatchupPage'
import { IncomePage } from './pages/IncomePage'
import { PayslipsPage } from './pages/PayslipsPage'
import { RaisesPage } from './pages/RaisesPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { UpcomingPage } from './pages/UpcomingPage'
import { AccountsPage } from './pages/AccountsPage'
import { ImportPage } from './pages/ImportPage'

export function App() {
  const authStatus = trpc.auth.status.useQuery()

  // Invite acceptance happens before any auth gate — an invitee has no account
  // yet. `/invite/<token>` is handled here rather than via the router (which
  // only mounts once authenticated).
  if (window.location.pathname.startsWith('/invite/')) {
    return <AcceptInvite token={decodeURIComponent(window.location.pathname.slice('/invite/'.length))} />
  }

  if (authStatus.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  if (authStatus.isError) {
    return <ConnectionError onRetry={() => void authStatus.refetch()} retrying={authStatus.isFetching} />
  }

  if (authStatus.data?.passwordSet && !authStatus.data.authenticated) {
    return <LoginGate />
  }

  return <AuthedApp />
}

function AuthedApp() {
  const ctx = trpc.bootstrap.context.useQuery()

  if (ctx.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  if (ctx.isError) {
    return <ConnectionError onRetry={() => void ctx.refetch()} retrying={ctx.isFetching} />
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
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="outgoings" element={<OutgoingsPage />} />
        <Route path="funding" element={<FundingPage />} />
        <Route path="upcoming" element={<UpcomingPage />} />
        <Route path="spending" element={<SpendingPage />} />
        <Route path="catchup" element={<CatchupPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="payslips" element={<PayslipsPage />} />
        <Route path="raises" element={<RaisesPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
