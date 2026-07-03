import { ActionIcon, AppShell, Badge, Burger, Group, NavLink, Text, useMantineColorScheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { trpc } from '../trpc'
import { hearthTokens } from '../theme'

function ThemeToggle({ visibleFrom }: { visibleFrom?: string }) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'
  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      onClick={toggleColorScheme}
      aria-label="Toggle colour scheme"
      visibleFrom={visibleFrom}
      style={{ color: hearthTokens.brand.linen, opacity: 0.65 }}
    >
      {isDark ? '☀' : '☾'}
    </ActionIcon>
  )
}

interface NavItem {
  to: string
  label: string
}

// Grouped navigation (spec §5.6): Plan · Track · People & income · Reports · Settings.
const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ to: '/', label: 'Overview' }] },
  {
    title: 'Plan',
    items: [
      { to: '/pots', label: 'Pots' },
      { to: '/outgoings', label: 'Outgoings' },
      { to: '/funding', label: 'Funding' },
    ],
  },
  {
    title: 'Track',
    items: [
      { to: '/spending', label: 'Spending' },
      { to: '/catchup', label: 'Catch-up' },
    ],
  },
  {
    title: 'People & income',
    items: [
      { to: '/income', label: 'Income' },
      { to: '/payslips', label: 'Payslips' },
      { to: '/raises', label: 'Raises' },
    ],
  },
  {
    title: null,
    items: [
      { to: '/reports', label: 'Reports' },
      { to: '/settings', label: 'Settings' },
    ],
  },
]

/** The hearth mark, optically nudged up so it sits on the text's cap height. */
function HearthMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ marginTop: -3, flexShrink: 0 }}>
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
  )
}

export function AppLayout() {
  const ctx = trpc.bootstrap.context.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()
  const location = useLocation()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure()

  useEffect(() => {
    closeMobile()
  }, [location.pathname])

  const household = ctx.data?.household
  const members = (ctx.data?.members ?? []).filter((m) => m.archivedAt === null)
  const people = members.filter((m) => m.kind === 'person')
  const backlogCount = backlogQuery.data?.perPot?.length ?? 0

  return (
    <AppShell
      header={{ height: { base: 52, sm: 0 } }}
      navbar={{ width: 210, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="xl"
      styles={{
        header: {
          backgroundColor: 'light-dark(var(--mantine-color-moss-6), var(--mantine-color-dark-7))',
          borderBottom: 'none',
        },
        navbar: {
          backgroundColor: 'light-dark(var(--mantine-color-moss-6), var(--mantine-color-dark-7))',
        },
        main: {
          backgroundColor: 'light-dark(var(--mantine-color-sand-1), var(--mantine-color-dark-8))',
        },
      }}
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between">
          <Group gap={10}>
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              size="sm"
              color={hearthTokens.brand.linen}
              aria-label="Toggle navigation"
            />
            <Text
              size="lg"
              fw={500}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                color: hearthTokens.brand.linen,
              }}
            >
              Hearth
            </Text>
          </Group>
          <ThemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section px="md" pt="xl" pb="lg">
          <Group gap={8} align="center">
            <HearthMark />
            <Text
              size="xl"
              fw={500}
              lh={1}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                color: hearthTokens.brand.linen,
              }}
            >
              Hearth
            </Text>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow px="xs" style={{ overflowY: 'auto' }}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title ?? `group-${i}`} style={{ marginBottom: 4 }}>
              {section.title && (
                <Text
                  size="xs"
                  fw={700}
                  tt="uppercase"
                  px="sm"
                  mt={i === 0 ? 0 : 14}
                  mb={4}
                  ff="monospace"
                  style={{ color: hearthTokens.brand.linen, opacity: 0.45, letterSpacing: '0.06em' }}
                >
                  {section.title}
                </Text>
              )}
              {section.items.map((item) => {
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
            </div>
          ))}
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
            {/* Mobile shows its own toggle in the header, so only render this on desktop. */}
            <ThemeToggle visibleFrom="sm" />
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
