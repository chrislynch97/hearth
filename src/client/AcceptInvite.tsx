import { useEffect, useState } from 'react'
import { Alert, Button, Card, Center, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { trpc } from './trpc'
import { hearthTokens } from './theme'
import { MIN_PASSWORD_LENGTH, validatePassword } from '../shared/password-policy'

/** Shown at /invite#<token> — lets an invitee create their account and join. */
export function AcceptInvite({ token }: { token: string }) {
  // `invitations.info` is a read declared as a mutation so the token goes in the
  // POST body rather than a logged URL (#176) — hence a manual fire on mount
  // instead of useQuery. `mutate` is referentially stable, so this runs once.
  const info = trpc.invitations.info.useMutation()
  const accept = trpc.invitations.accept.useMutation()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const loadInfo = info.mutate
  useEffect(() => {
    loadInfo({ token })
  }, [loadInfo, token])

  // Idle counts as loading: the mutation hasn't fired yet on the first render,
  // and a "not valid" alert there would be wrong.
  const checking = info.isIdle || info.isPending

  async function submit() {
    setError('')
    const weak = validatePassword(password)
    if (weak) return setError(weak)
    if (!username.trim() || !displayName.trim()) return setError('Fill in your name and a username.')
    try {
      await accept.mutateAsync({ token, username: username.trim(), displayName: displayName.trim(), password })
      window.location.href = '/'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the invitation.')
    }
  }

  return (
    <Center h="100vh">
      <Card withBorder padding="xl" radius="lg" w={380}>
        <Stack gap="md">
          <Group gap={10} justify="center">
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
              <polyline points="8,25 24,10 40,25" stroke={hearthTokens.brand.moss} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 25 V40 H34 V25" stroke={hearthTokens.brand.moss} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="32" r="3.8" fill={hearthTokens.brand.apricot} />
            </svg>
            <Text fw={500} fz={22} style={{ fontFamily: 'var(--mantine-font-family-headings)' }}>
              Hearth
            </Text>
          </Group>

          {checking ? (
            <Text size="sm" c="dimmed" ta="center">
              Checking your invitation…
            </Text>
          ) : !info.data ? (
            <Alert color="red" title="Invitation not valid">
              This invite link is invalid, already used, or expired. Ask whoever invited you for a fresh one.
            </Alert>
          ) : (
            <>
              <Text size="sm" c="dimmed" ta="center">
                You&apos;ve been invited to join <b>{info.data.householdName}</b> as {info.data.role}. Create an
                account to continue.
              </Text>
              <TextInput label="Your name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} autoFocus />
              <TextInput label="Username" value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="username" />
              <PasswordInput
                label="Password"
                description={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                autoComplete="new-password"
              />
              {error && (
                <Alert color="red" title="Error">
                  {error}
                </Alert>
              )}
              <Button onClick={() => void submit()} loading={accept.isPending} fullWidth>
                Join {info.data.householdName}
              </Button>
            </>
          )}
        </Stack>
      </Card>
    </Center>
  )
}
