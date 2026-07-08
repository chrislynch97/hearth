import { useState } from 'react'
import { Button, Card, Center, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { trpc } from './trpc'
import { hearthTokens } from './theme'

/** Shown when the instance has a shared password and this session isn't authenticated. */
export function LoginGate() {
  const utils = trpc.useUtils()
  const login = trpc.auth.login.useMutation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    try {
      const result = await login.mutateAsync({
        username: username.trim(),
        password,
        code: mfaRequired ? code : undefined,
      })
      if (result.ok) {
        await utils.invalidate()
        return
      }
      // Password accepted; server now wants the second factor.
      setMfaRequired(true)
    } catch {
      if (mfaRequired) {
        setError('Incorrect code')
        setCode('')
      } else {
        setError('Incorrect username or password')
        setPassword('')
      }
    }
  }

  return (
    <Center h="100vh">
      <Card withBorder padding="xl" radius="lg" w={360}>
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
          <Text size="sm" c="dimmed" ta="center">
            {mfaRequired
              ? 'Enter the code from your authenticator app.'
              : 'Sign in to your household.'}
          </Text>
          {mfaRequired ? (
            <TextInput
              label="Authentication code"
              description="6-digit code, or one of your recovery codes"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              error={error || undefined}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
          ) : (
            <>
              <TextInput
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                autoComplete="username"
                autoFocus
              />
              <PasswordInput
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                error={error || undefined}
                autoComplete="current-password"
              />
            </>
          )}
          <Button onClick={() => void submit()} loading={login.isPending} fullWidth>
            Unlock
          </Button>
        </Stack>
      </Card>
    </Center>
  )
}
