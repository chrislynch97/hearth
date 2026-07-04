import { Component, type ReactNode } from 'react'
import { Button, Card, Center, Stack, Text, Title } from '@mantine/core'

/** Catches render-time crashes anywhere in the tree and offers a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <Center h="100vh" p="md">
          <Card withBorder padding="xl" radius="lg" maw={420}>
            <Stack gap="sm">
              <Title order={4}>Something went wrong</Title>
              <Text size="sm" c="dimmed">
                The app hit an unexpected error. Reloading usually fixes it; your data is safe.
              </Text>
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </Stack>
          </Card>
        </Center>
      )
    }
    return this.props.children
  }
}

/** Shown when a critical query can't reach the server. */
export function ConnectionError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <Center h="60vh" p="md">
      <Card withBorder padding="xl" radius="lg" maw={420}>
        <Stack gap="sm">
          <Title order={4}>Can't reach the server</Title>
          <Text size="sm" c="dimmed">
            Hearth couldn't load your data. Check that the server is running, then try again.
          </Text>
          <Button onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        </Stack>
      </Card>
    </Center>
  )
}
