import {
  AppShell,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from '@mantine/core'
import { trpc } from './trpc'

function ThemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme()
  return (
    <Button variant="default" size="xs" onClick={toggleColorScheme}>
      Toggle theme
    </Button>
  )
}

export function App() {
  const ctx = trpc.bootstrap.context.useQuery()

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Hearthledger</Title>
          <ThemeToggle />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {ctx.isLoading && (
          <Center h={200}>
            <Loader />
          </Center>
        )}
        {ctx.data?.needsSetup && (
          <Stack>
            <Title order={2}>Welcome</Title>
            <Text>Let's set up your household. (Setup wizard arrives in Phase 2.)</Text>
          </Stack>
        )}
        {ctx.data && !ctx.data.needsSetup && (
          <Text>Ready — {ctx.data.household?.displayName}.</Text>
        )}
      </AppShell.Main>
    </AppShell>
  )
}
