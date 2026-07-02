import { ActionIcon, AppShell, Badge, Group, NavLink, Text, useMantineColorScheme } from '@mantine/core'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { trpc } from '../trpc'
import { hearthTokens } from '../theme'

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'
  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      onClick={toggleColorScheme}
      aria-label="Toggle colour scheme"
      style={{ color: hearthTokens.brand.linen, opacity: 0.65 }}
    >
      {isDark ? '☀' : '☾'}
    </ActionIcon>
  )
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview' },
  { to: '/pots', label: 'Pots' },
  { to: '/outgoings', label: 'Outgoings' },
  { to: '/funding', label: 'Funding' },
  { to: '/spending', label: 'Spending' },
  { to: '/catchup', label: 'Catch-up' },
]

export function AppLayout() {
  const ctx = trpc.bootstrap.context.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()
  const location = useLocation()

  const household = ctx.data?.household
  const members = (ctx.data?.members ?? []).filter((m) => m.archivedAt === null)
  const people = members.filter((m) => m.kind === 'person')
  const backlogCount = backlogQuery.data?.perPot?.length ?? 0

  return (
    <AppShell
      navbar={{ width: 210, breakpoint: 'sm' }}
      padding="xl"
      styles={{
        navbar: {
          backgroundColor: 'light-dark(var(--mantine-color-moss-6), var(--mantine-color-dark-7))',
        },
        main: {
          backgroundColor: 'light-dark(var(--mantine-color-sand-1), var(--mantine-color-dark-8))',
        },
      }}
    >
      <AppShell.Navbar>
        <AppShell.Section px="md" pt="xl" pb="lg">
          <Group gap={10}>
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <polyline
                points="8,25 24,10 40,25"
                stroke={hearthTokens.brand.linen}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 25 V40 H34 V25"
                stroke={hearthTokens.brand.linen}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="32" r="3.8" fill={hearthTokens.brand.apricot} />
            </svg>
            <Text
              size="xl"
              fw={500}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                color: hearthTokens.brand.linen,
              }}
            >
              Hearth
            </Text>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow px="xs">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to
            return (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={item.label}
                active={isActive}
                variant="light"
                style={{
                  borderRadius: 8,
                  marginBottom: 2,
                  backgroundColor: isActive ? 'rgba(239, 237, 227, 0.18)' : undefined,
                }}
                styles={{
                  label: {
                    color: hearthTokens.brand.linen,
                    fontWeight: isActive ? 500 : 400,
                  },
                }}
                rightSection={
                  item.to === '/catchup' && backlogCount > 0 ? (
                    <Badge size="sm" color="apricot" variant="filled" circle>
                      {backlogCount}
                    </Badge>
                  ) : undefined
                }
              />
            )
          })}
        </AppShell.Section>

        <AppShell.Section px="md" pb="md" pt="sm">
          <Group gap={8} justify="space-between">
            <Group gap={8}>
              {people.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: m.color ?? hearthTokens.brand.moss,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: hearthTokens.brand.linen,
                    flexShrink: 0,
                  }}
                >
                  {(m.shortLabel ?? m.displayName).charAt(0).toUpperCase()}
                </div>
              ))}
              <Text size="sm" style={{ color: hearthTokens.brand.linen, opacity: 0.65 }}>
                {household?.displayName ?? 'Hearth'}
              </Text>
            </Group>
            <ThemeToggle />
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
