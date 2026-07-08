import { useState } from 'react'
import { Anchor, Button, Card, Center, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { trpc } from './trpc'
import { hearthTokens } from './theme'
import { MIN_PASSWORD_LENGTH, validatePassword } from '../shared/password-policy'

/** Shown when the instance is locked and this session isn't authenticated. Also
 *  offers self-registration when the instance has open registration enabled. */
export function LoginGate() {
  const utils = trpc.useUtils()
  const login = trpc.auth.login.useMutation()
  const register = trpc.auth.register.useMutation()
  const regOpen = trpc.auth.registrationOpen.useQuery()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [code, setCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [error, setError] = useState('')

  const canRegister = regOpen.data?.allowOpenRegistration ?? false

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

  async function submitRegister() {
    setError('')
    const weak = validatePassword(password)
    if (weak) return setError(weak)
    try {
      await register.mutateAsync({
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        householdName: householdName.trim(),
      })
      await utils.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account.')
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
            {mode === 'register'
              ? 'Create your account and household.'
              : mfaRequired
                ? 'Enter the code from your authenticator app.'
                : 'Sign in to your household.'}
          </Text>

          {mode === 'register' ? (
            <>
              <TextInput
                label="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
                autoComplete="name"
                autoFocus
              />
              <TextInput label="Username" value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="username" />
              <TextInput
                label="Household name"
                description="Your new household — you'll be its owner."
                value={householdName}
                onChange={(e) => setHouseholdName(e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitRegister()}
                error={error || undefined}
                autoComplete="new-password"
              />
              <Button onClick={() => void submitRegister()} loading={register.isPending} fullWidth>
                Create account
              </Button>
              <Text size="xs" c="dimmed" ta="center">
                Already have an account?{' '}
                <Anchor component="button" type="button" size="xs" onClick={() => { setMode('login'); setError('') }}>
                  Sign in
                </Anchor>
              </Text>
            </>
          ) : mfaRequired ? (
            <>
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
              <Button onClick={() => void submit()} loading={login.isPending} fullWidth>
                Unlock
              </Button>
            </>
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
              <Button onClick={() => void submit()} loading={login.isPending} fullWidth>
                Unlock
              </Button>
              {canRegister && (
                <Text size="xs" c="dimmed" ta="center">
                  New here?{' '}
                  <Anchor component="button" type="button" size="xs" onClick={() => { setMode('register'); setError('') }}>
                    Create an account
                  </Anchor>
                </Text>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Center>
  )
}
