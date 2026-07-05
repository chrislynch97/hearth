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
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { trpc } from '../trpc'
import { hearthTokens } from '../theme'
import { QuickAddSpend } from '../QuickAddSpend'
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
    ['n', 'Add a spend'],
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
      { to: '/upcoming', label: 'Upcoming' },
    ],
  },
  {
    title: 'Track',
    items: [
      { to: '/spending', label: 'Spending' },
      { to: '/catchup', label: 'Catch-up' },
      { to: '/import', label: 'Import' },
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
    title: 'Wealth',
    items: [{ to: '/accounts', label: 'Net worth' }],
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
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    closeMobile()
  }, [location.pathname])

  // Global keyboard shortcuts (spec §7): n = add spend, g+letter = navigate, ? = help.
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
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setQuickAddOpen(true)
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
              component={Link}
              to="/"
              size="lg"
              fw={500}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                color: hearthTokens.brand.linen,
                textDecoration: 'none',
              }}
            >
              Hearth
            </Text>
          </Group>
          <Group gap={4}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Add spend"
              style={{ color: hearthTokens.brand.linen }}
            >
              ＋
            </ActionIcon>
            <ThemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section px="md" pt="xl" pb="md">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Group gap={8} align="center" mb="md" style={{ cursor: 'pointer' }}>
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
          <Button
            fullWidth
            size="xs"
            color="apricot"
            variant="filled"
            onClick={() => setQuickAddOpen(true)}
            styles={{ label: { color: hearthTokens.brand.ink } }}
          >
            + Add spend
          </Button>
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
                    className="hearth-navlink"
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
              {people.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: m.color ?? hearthTokens.ownerPalette[i % hearthTokens.ownerPalette.length],
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

      <QuickAddSpend opened={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <ShortcutsHelp opened={helpOpen} onClose={() => setHelpOpen(false)} />
      <NavPalette opened={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </AppShell>
  )
}
