import {
  AppShell,
  Button,
  Center,
  Group,
  Loader,
  Title,
  useMantineColorScheme,
} from '@mantine/core'
import { trpc } from './trpc'
import { SetupWizard } from './setup/SetupWizard'
import { MainApp } from './MainApp'

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
          <SetupWizard
            householdName={ctx.data.household?.displayName ?? 'My Household'}
            currencyCode={ctx.data.household?.currencyCode ?? 'GBP'}
          />
        )}
        {ctx.data && !ctx.data.needsSetup && ctx.data.household && (
          <MainApp household={ctx.data.household} members={ctx.data.members} />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
