import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Button,
  Group,
  Kbd,
  Modal,
  NavLink,
  Stack,
  Text,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState, type ReactElement } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { trpc } from '../trpc'
import { hearthTokens } from '../theme'
import './nav.css'

// `g` then one of these navigates (spec §7).
const GO_TO: Record<string, string> = {
  d: '/',
  p: '/pots',
  o: '/outgoings',
  f: '/funding',
  u: '/upcoming',
  s: '/spending',
  c: '/catchup',
  i: '/income',
  w: '/accounts',
  r: '/reports',
}

function ShortcutsHelp({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ['/', 'Go to page…'],
    ['[ ]', 'Previous / next period'],
    ['g then d', 'Go to Overview'],
    ['g then p / o / f / u', 'Pots / Outgoings / Funding / Upcoming'],
    ['g then s / c', 'Spending / Catch-up'],
    ['g then i / w / r', 'Income / Net worth / Reports'],
    ['?', 'Show this help'],
  ]
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <Stack gap="xs">
        {rows.map(([keys, desc]) => (
          <Group key={keys} justify="space-between">
            <Text size="sm">{desc}</Text>
            <Group gap={4}>
              {keys.split(' ').map((k, i) => (k === 'then' ? <Text key={i} size="xs" c="dimmed">then</Text> : <Kbd key={i}>{k}</Kbd>))}
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  )
}

/** Quick "go to…" palette opened with `/` (spec §7). Type to filter destinations,
 *  Enter jumps to the top match. */
function NavPalette({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const items = NAV_SECTIONS.flatMap((s) => s.items)
  const filtered = query
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : items

  function go(to: string) {
    setQuery('')
    onClose()
    navigate(to)
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Go to…" size="sm">
      <TextInput
        data-autofocus
        placeholder="Search pages…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtered[0]) {
            e.preventDefault()
            go(filtered[0].to)
          }
        }}
        mb="sm"
      />
      <Stack gap={2}>
        {filtered.map((i) => (
          <Button key={i.to} variant="subtle" color="gray" justify="flex-start" onClick={() => go(i.to)}>
            {i.label}
          </Button>
        ))}
        {filtered.length === 0 && (
          <Text size="sm" c="dimmed">
            No matching page.
          </Text>
        )}
      </Stack>
    </Modal>
  )
}

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
  icon: IconName
}

// Grouped navigation (spec §5.6): Plan · Track · People & income · Reports · Settings.
const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ to: '/', label: 'Overview', icon: 'home' }] },
  {
    title: 'Plan',
    items: [
      { to: '/categories', label: 'Categories', icon: 'categories' },
      { to: '/pots', label: 'Pots', icon: 'pots' },
      { to: '/outgoings', label: 'Bills', icon: 'bills' },
      { to: '/funding', label: 'Funding', icon: 'funding' },
      { to: '/upcoming', label: 'Upcoming', icon: 'upcoming' },
    ],
  },
  {
    title: 'Track',
    items: [
      { to: '/spending', label: 'Spending', icon: 'spending' },
      { to: '/catchup', label: 'Catch-up', icon: 'catchup' },
      { to: '/import', label: 'Import', icon: 'import' },
    ],
  },
  {
    title: 'People & income',
    items: [
      { to: '/income', label: 'Income', icon: 'income' },
      { to: '/payslips', label: 'Payslips', icon: 'payslips' },
      { to: '/raises', label: 'Raises', icon: 'raises' },
    ],
  },
  {
    title: 'Wealth',
    items: [{ to: '/accounts', label: 'Net worth', icon: 'networth' }],
  },
  {
    title: null,
    items: [
      { to: '/reports', label: 'Reports', icon: 'reports' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

type IconName =
  | 'home'
  | 'categories'
  | 'pots'
  | 'bills'
  | 'funding'
  | 'upcoming'
  | 'spending'
  | 'catchup'
  | 'import'
  | 'income'
  | 'payslips'
  | 'raises'
  | 'networth'
  | 'reports'
  | 'settings'

// Hand-rolled line icons (24×24, stroke = currentColor) so we stay dependency-free
// and match the app's existing inline-SVG style.
const NAV_ICONS: Record<IconName, ReactElement> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  categories: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  pots: <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M5 8h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />,
  bills: <path d="M6 2h9l3 3v17l-2.2-1.3L13.6 22 11 20.7 8.4 22 6 20.7zM9 8h6M9 12h6" />,
  funding: <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />,
  upcoming: <path d="M3 4.5h18a0 0 0 0 1 0 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v3M16 3v3" />,
  spending: <path d="M2.5 5h19a0 0 0 0 1 0 0v14H2.5zM2.5 9.5h19M6 15h4" />,
  catchup: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.5h-3.5" />,
  import: <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  income: <path d="M3 6h18v13H3zM3 10h18M16 14.5h2" />,
  payslips: <path d="M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6" />,
  raises: <path d="M3 17l6-6 4 4 7-7M17 8h4v4" />,
  networth: <path d="M3 9.5 12 4l9 5.5M3 21h18M5 10v8M10 10v8M14 10v8M19 10v8" />,
  reports: <path d="M3 21h18M6.5 18v-6M12 18V7M17.5 18v-9" />,
  settings: (
    <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  ),
}

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: hearthTokens.brand.linen, flexShrink: 0 }}
    >
      {NAV_ICONS[name]}
    </svg>
  )
}

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
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure()
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    closeMobile()
  }, [location.pathname])

  // Global keyboard shortcuts (spec §7): g+letter = navigate, ? = help.
  useEffect(() => {
    let gPending = false
    let gTimer: ReturnType<typeof setTimeout> | undefined

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        return
      }
      if (gPending) {
        gPending = false
        const to = GO_TO[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          navigate(to)
        }
        return
      }
      if (e.key === '?') {
        setHelpOpen(true)
      } else if (e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === '[' || e.key === ']') {
        // Prev/next budget period — period-aware pages listen for this.
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('hearth:period', { detail: e.key === '[' ? -1 : 1 }))
      } else if (e.key === 'g') {
        gPending = true
        gTimer = setTimeout(() => {
          gPending = false
        }, 1200)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (gTimer) clearTimeout(gTimer)
    }
  }, [navigate])

  const household = ctx.data?.household
  const members = (ctx.data?.members ?? []).filter((m) => m.archivedAt === null)
  const people = members.filter((m) => m.kind === 'person')
  const backlogCount = backlogQuery.data?.perPot?.length ?? 0

  return (
    <AppShell
      header={{ height: { base: 52, sm: 0 } }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
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
        <Group h="100%" px="md" gap={10}>
          <Burger
            opened={mobileOpened}
            onClick={toggleMobile}
            size="sm"
            color={hearthTokens.brand.linen}
            aria-label="Toggle navigation"
          />
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Group gap={8} align="center" style={{ cursor: 'pointer' }}>
              <HearthMark size={22} />
              <Text
                size="lg"
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
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section
          visibleFrom="sm"
          px="md"
          pt="md"
          pb="sm"
          style={{ borderBottom: '1px solid rgba(239, 237, 227, 0.14)' }}
        >
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Group gap={8} align="center" style={{ cursor: 'pointer' }}>
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
          </Link>
        </AppShell.Section>

        <AppShell.Section grow px="xs" pt="sm" style={{ overflowY: 'auto', overscrollBehavior: 'contain' }}>
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
                    className="hearth-navlink"
                    leftSection={<NavIcon name={item.icon} />}
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

        <AppShell.Section
          px="md"
          pb="md"
          pt="sm"
          style={{ borderTop: '1px solid rgba(239, 237, 227, 0.14)' }}
        >
          <Group gap={8} justify="space-between">
            <Group gap={8}>
              {people.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: m.color ?? hearthTokens.ownerPalette[i % hearthTokens.ownerPalette.length],
                    boxShadow: 'inset 0 0 0 1.5px rgba(239, 237, 227, 0.55)',
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

      <ShortcutsHelp opened={helpOpen} onClose={() => setHelpOpen(false)} />
      <NavPalette opened={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </AppShell>
  )
}
