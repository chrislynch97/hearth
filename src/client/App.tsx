import { Center, Loader } from '@mantine/core'
import { RouterProvider } from '@tanstack/react-router'
import { trpc } from '@/trpc'
import { ConnectionError } from './ErrorState'
import { LoginGate } from './LoginGate'
import { FirstRunGate } from './FirstRunGate'
import { AcceptInvite } from './AcceptInvite'
import { ResetPassword } from './ResetPassword'
import { VerifyEmail } from './VerifyEmail'
import { readInviteToken, readResetPasswordToken, readVerifyEmailToken } from './inviteLink'
import { SetupWizard } from './setup/SetupWizard'
import { router } from './router'

export function App() {
  const authStatus = trpc.auth.status.useQuery()

  // The emailed-link screens run before any auth gate: an invitee has no account
  // yet, and someone who's forgotten their password (or is confirming an address
  // from their phone) has no session. All three are handled here rather than via
  // the router, which only mounts once authenticated.
  const inviteToken = readInviteToken(window.location)
  if (inviteToken !== null) {
    return <AcceptInvite token={inviteToken} />
  }

  const resetToken = readResetPasswordToken(window.location)
  if (resetToken !== null) {
    return <ResetPassword token={resetToken} />
  }

  const verifyToken = readVerifyEmailToken(window.location)
  if (verifyToken !== null) {
    return <VerifyEmail token={verifyToken} />
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
