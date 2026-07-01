import { AppShell, Badge, Button, Group, NavLink, Title, useMantineColorScheme } from '@mantine/core'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'

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
  { to: '/spending', label: 'Spending' },
  { to: '/catchup', label: 'Catch-up' },
]

export function AppLayout() {
  const ctx = trpc.bootstrap.context.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()
  const location = useLocation()

  const household = ctx.data?.household
  const grandTotal = backlogQuery.data?.grandTotal ?? 0

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
            rightSection={
              item.to === '/catchup' && grandTotal !== 0 && household ? (
                <Badge size="sm" color="orange" variant="filled">
                  {formatMoney(Math.abs(grandTotal), {
                    symbol: household.currencySymbol,
                    decimalPlaces: household.currencyDecimalPlaces,
                    locale: household.locale,
                  })}
                </Badge>
              ) : undefined
            }
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
