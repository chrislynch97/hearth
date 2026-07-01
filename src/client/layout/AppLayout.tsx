import { AppShell, Button, Group, NavLink, Title, useMantineColorScheme } from '@mantine/core'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { trpc } from '../trpc'

function ThemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme()
  return (
    <Button variant="default" size="xs" onClick={toggleColorScheme}>
      Toggle theme
    </Button>
  )
}

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/pots', label: 'Pots & Categories' },
  { to: '/outgoings', label: 'Outgoings' },
  { to: '/funding', label: 'Funding Plan' },
]

export function AppLayout() {
  const ctx = trpc.bootstrap.context.useQuery()
  const location = useLocation()

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'sm' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>{ctx.data?.household?.displayName ?? 'Hearthledger'}</Title>
          <ThemeToggle />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            label={item.label}
            active={location.pathname === item.to}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
