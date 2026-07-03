import { useState } from 'react'
import { Button, Card, Center, Group, PasswordInput, Stack, Text } from '@mantine/core'
import { trpc } from './trpc'
import { hearthTokens } from './theme'

/** Shown when the instance has a shared password and this session isn't authenticated. */
export function LoginGate() {
  const utils = trpc.useUtils()
  const login = trpc.auth.login.useMutation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    try {
      await login.mutateAsync({ password })
      await utils.auth.status.invalidate()
    } catch {
      setError('Incorrect password')
      setPassword('')
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
            This household is password protected.
          </Text>
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            error={error || undefined}
            autoFocus
          />
          <Button onClick={() => void submit()} loading={login.isPending} fullWidth>
            Unlock
          </Button>
        </Stack>
      </Card>
    </Center>
  )
}
