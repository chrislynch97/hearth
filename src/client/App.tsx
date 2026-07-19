import { Center, Loader } from '@mantine/core'
import { RouterProvider } from '@tanstack/react-router'
import { trpc } from '@/trpc'
import { ConnectionError } from './ErrorState'
import { LoginGate } from './LoginGate'
import { FirstRunGate } from './FirstRunGate'
import { AcceptInvite } from './AcceptInvite'
import { SetupWizard } from './setup/SetupWizard'
import { router } from './router'

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

  // Open instance exposed off-box with no opt-in: every protected procedure is
  // 403'd by the server gate, so the app can't boot normally. Offer a first-run
  // "set your owner password" screen instead of a dead app (#34).
  if (authStatus.data?.firstRunRequired) {
    return <FirstRunGate />
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
        locale={ctx.data.household?.locale ?? 'en-GB'}
      />
    )
  }

  return <RouterProvider router={router} />
}
