import { useEffect, useRef, useState } from 'react'
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import { Link } from 'react-router-dom'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { periodForDate, shiftPeriod, periodConfig } from '../../shared/period'
import { useMoney, useFormatDate } from '../useMoney'
import { hearthTokens, chartXAxisProps } from '../theme'
import type { MoneyFormat } from '../useMoney'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

// ---------------------------------------------------------------------------
// A — Catch-up backlog headline
// ---------------------------------------------------------------------------

function BacklogHeadline({
  backlog,
  money,
}: {
  backlog: { grandTotal: number; perPot: Array<{ potId: string }>; unassigned: { count: number } }
  money: MoneyFormat
}) {
  const toReconcile = backlog.perPot.length
  const needsPot = backlog.unassigned.count
  const active = toReconcile > 0 || needsPot > 0

  return (
    <Card
      padding="lg"
      radius="lg"
      style={{
        backgroundColor: active
          ? `light-dark(${hearthTokens.surface.warmTint}, rgba(217, 140, 95, 0.10))`
          : 'light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))',
        border: active ? `1px solid ${hearthTokens.brand.apricot}55` : '1px solid transparent',
      }}
    >
      <Group justify="space-between" align="center">
        <Stack gap={2}>
          {active ? (
            <>
              <Text fw={700} fz={22} style={{ fontFamily: 'var(--mantine-font-family-headings)' }}>
                {toReconcile > 0
                  ? `${toReconcile} pot${toReconcile === 1 ? '' : 's'} to reconcile`
                  : 'Spending to sort'}
              </Text>
              <Text size="sm" c="dimmed">
                Move {formatMoney(Math.abs(backlog.grandTotal), money)} between pots
                {needsPot > 0 ? ` · ${needsPot} need a pot` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text fw={700} fz={22} style={{ fontFamily: 'var(--mantine-font-family-headings)' }}>
                You're all caught up
              </Text>
              <Text size="sm" c="dimmed">
                No spending waiting to be reconciled.
              </Text>
            </>
          )}
        </Stack>
        {active && (
          <Button component={Link} to="/catchup" color={hearthTokens.semantic.attention} variant="filled">
            Catch up
          </Button>
        )}
      </Group>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// C — This-period snapshot
// ---------------------------------------------------------------------------

function SnapshotSection({
  perPerson,
  jointPotFundingTotal,
  coupleSurplus,
  money,
}: {
  perPerson: Array<{ memberId: string; displayName: string; periodIncome: number; setAside: number; remainder: number }>
  jointPotFundingTotal: number
  coupleSurplus: number
  money: MoneyFormat
}) {
  if (perPerson.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Set up your outgoings and income to see your snapshot for this period here.
      </Text>
    )
  }
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: perPerson.length > 1 ? 2 : 1 }} spacing="sm">
        {perPerson.map((p) => (
          <Card key={p.memberId} withBorder padding="md" radius="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" ff="monospace" lts="0.05em" mb={6}>
              {p.displayName}
            </Text>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Income
              </Text>
              <Text size="sm">{formatMoney(p.periodIncome, money)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Set aside
              </Text>
              <Text size="sm">{formatMoney(p.setAside, money)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={700} c={p.remainder < 0 ? 'red' : undefined}>
                Remainder
              </Text>
              <Text size="sm" fw={700} c={p.remainder < 0 ? 'red' : undefined}>
                {formatMoney(p.remainder, money)}
              </Text>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      <Group justify="space-between" px="xs">
        <Text size="sm" c="dimmed">
          Joint pots total {formatMoney(jointPotFundingTotal, money)}
        </Text>
        <Text size="sm" fw={700} c={coupleSurplus < 0 ? 'red' : hearthTokens.semantic.positive}>
          Couple surplus {formatMoney(coupleSurplus, money)}
        </Text>
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Net worth tile — current standing (period-independent), links to /accounts
// ---------------------------------------------------------------------------

function NetWorthTile({
  data,
  money,
}: {
  data: {
    assets: number
    liabilities: number
    netWorth: number
    timeline: Array<{ date: string; netWorth: number }>
  }
  money: MoneyFormat
}) {
  const hasData = data.assets !== 0 || data.liabilities !== 0 || data.timeline.length > 0
  if (!hasData) return null
  const negative = data.netWorth < 0
  const spark = data.timeline.slice(-12)
  const maxAbs = Math.max(1, ...spark.map((p) => Math.abs(p.netWorth)))
  return (
    <Card
      component={Link}
      to="/accounts"
      padding="lg"
      radius="lg"
      style={{
        textDecoration: 'none',
        color: 'inherit',
        backgroundColor: 'light-dark(var(--mantine-color-moss-0), var(--mantine-color-dark-6))',
        border: `1px solid ${hearthTokens.brand.moss}33`,
      }}
    >
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <div>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" ff="monospace" lts="0.05em" mb={4}>
            Net worth
          </Text>
          <Text
            fw={700}
            fz={28}
            c={negative ? 'red' : undefined}
            style={{ fontFamily: 'var(--mantine-font-family-headings)', lineHeight: 1.1 }}
          >
            {formatMoney(data.netWorth, money)}
          </Text>
          <Group gap="md" mt={4}>
            <Text size="xs" c="dimmed">
              Assets {formatMoney(data.assets, money)}
            </Text>
            <Text size="xs" c="dimmed">
              Liabilities {formatMoney(data.liabilities, money)}
            </Text>
          </Group>
        </div>
        {spark.length >= 2 && (
          <Group gap={3} align="flex-end" h={44} wrap="nowrap" style={{ flexShrink: 0 }}>
            {spark.map((p) => (
              <Box
                key={p.date}
                title={`${p.date}: ${formatMoney(p.netWorth, money)}`}
                style={{
                  width: 6,
                  height: `${Math.max(2, (Math.abs(p.netWorth) / maxAbs) * 40)}px`,
                  borderRadius: 2,
                  backgroundColor: p.netWorth < 0 ? hearthTokens.brand.apricot : hearthTokens.brand.moss,
                }}
              />
            ))}
          </Group>
        )}
      </Group>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// D — Allocation by category
// ---------------------------------------------------------------------------

function AllocationCard({
  allocation,
  householdIncome,
  money,
}: {
  allocation: { perCategory: Array<{ categoryId: string | null; name: string; funding: number }>; total: number }
  householdIncome: number
  money: MoneyFormat
}) {
  if (allocation.perCategory.length === 0) return null
  const max = allocation.perCategory[0]?.funding ?? 1
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Allocation by category
      </Title>
      <Stack gap="xs">
        {allocation.perCategory.map((c) => (
          <Box key={c.categoryId ?? 'uncat'}>
            <Group justify="space-between" mb={2}>
              <Text size="sm">{c.name}</Text>
              <Group gap="md">
                <Text size="sm" c="dimmed">
                  {pct(c.funding, householdIncome)} of income
                </Text>
                <Text size="sm">{formatMoney(c.funding, money)}</Text>
              </Group>
            </Group>
            <Box
              style={{
                height: 6,
                borderRadius: 3,
                width: `${Math.max(4, (c.funding / max) * 100)}%`,
                backgroundColor: hearthTokens.brand.moss,
              }}
            />
          </Box>
        ))}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// E — Income trend
// ---------------------------------------------------------------------------

function TrendCard({ trend, money }: { trend: Array<{ month: string; net: number }>; money: MoneyFormat }) {
  const hasData = trend.some((m) => m.net > 0)
  if (!hasData) return null
  // Show just the month (MM); 12 consecutive months are each distinct.
  const data = trend.map((m) => ({ month: m.month.slice(5), net: m.net }))
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Net income · last 12 months
      </Title>
      <BarChart
        h={150}
        data={data}
        dataKey="month"
        withYAxis={false}
        series={[{ name: 'net', label: 'Net income', color: hearthTokens.brand.moss }]}
        valueFormatter={(v) => formatMoney(v, money)}
        xAxisProps={chartXAxisProps}
        gridAxis="none"
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// G — Upcoming payments
// ---------------------------------------------------------------------------

function UpcomingCard({
  upcoming,
  money,
}: {
  upcoming: Array<{ expenseId: string; name: string; date: string; amount: number; daysUntil: number; dueSoon: boolean }>
  money: MoneyFormat
}) {
  if (upcoming.length === 0) return null
  const total = upcoming.reduce((acc, u) => acc + u.amount, 0)
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Upcoming payments</Title>
        <Text size="sm" c="dimmed">
          {formatMoney(total, money)} next 30 days
        </Text>
      </Group>
      <Stack gap={4}>
        {upcoming.map((u, i) => (
          <Group key={`${u.expenseId}-${i}`} justify="space-between" px="xs" py={4}>
            <Group gap="xs">
              <Text size="sm">{u.name}</Text>
              <Badge size="sm" variant="light" color={u.dueSoon ? 'apricot' : 'gray'}>
                {u.daysUntil === 0 ? 'today' : `in ${u.daysUntil}d`}
              </Badge>
            </Group>
            <Text size="sm">{formatMoney(u.amount, money)}</Text>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// F — Recent activity (with inline quick-assign for null-pot rows)
// ---------------------------------------------------------------------------

function RecentActivityCard({
  recent,
  money,
}: {
  recent: Array<{
    id: string
    date: string
    description: string
    amount: number
    ownerId: string
    potName: string | null
    potId: string | null
  }>
  money: MoneyFormat
}) {
  const utils = trpc.useUtils()
  const fmt = useFormatDate()
  const potsQuery = trpc.pots.list.useQuery()
  const update = trpc.spends.update.useMutation()
  const pots = potsQuery.data ?? []

  if (recent.length === 0) return null

  async function assign(spendId: string, potId: string | null) {
    if (!potId) return
    // No optimistic-lock guard: the recent-activity projection doesn't carry the
    // spend's updatedAt, so this quick pot-assign stays last-write-wins (#23).
    // The full spend edit form on the Spending page is guarded.
    await update.mutateAsync({ id: spendId, potId })
    await Promise.all([utils.dashboard.summary.invalidate(), utils.reconcile.backlog.invalidate()])
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Recent activity
      </Title>
      <Stack gap={2}>
        {recent.map((r) => (
          <Group key={r.id} justify="space-between" px="xs" py={4} wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <Text size="sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.description}
              </Text>
              <Text size="xs" c="dimmed">
                {fmt(r.date)}
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {r.potName ? (
                <Badge size="sm" variant="light">
                  {r.potName}
                </Badge>
              ) : (
                <Select
                  size="xs"
                  placeholder="Assign a pot"
                  w={160}
                  data={pots.filter((p) => p.ownerId === r.ownerId).map((p) => ({ value: p.id, label: p.name }))}
                  searchable
                  onChange={(v) => void assign(r.id, v)}
                />
              )}
              <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(r.amount, money)}
              </Text>
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

export function HomePage() {
  const money = useMoney()
  const ctx = trpc.bootstrap.context.useQuery()
  const periodCfg = periodConfig(ctx.data?.household ?? 1)

  const [periodStart, setPeriodStart] = useState<string | undefined>(undefined)
  const summaryQuery = trpc.dashboard.summary.useQuery(periodStart ? { periodStart } : undefined)
  const accountsSummary = trpc.accounts.summary.useQuery()

  const me = trpc.users.me.useQuery()
  // Greet the person: their linked budgeting member, else their account name,
  // falling back to the household name (e.g. an open instance with no account).
  const householdName = ctx.data?.household?.displayName
  const greetingName = me.data?.linkedMemberName || me.data?.displayName || householdName
  const summary = summaryQuery.data

  function shift(delta: number) {
    const base = summary?.period ?? periodForDate(new Date().toISOString().slice(0, 10), periodCfg)
    setPeriodStart(shiftPeriod(base, delta, periodCfg).start)
  }

  // `[` / `]` (handled globally in AppLayout) shift the period. Use a ref so the
  // listener always calls the latest shift without re-subscribing each render.
  const shiftRef = useRef(shift)
  shiftRef.current = shift
  useEffect(() => {
    const onPeriod = (e: Event) => shiftRef.current((e as CustomEvent<number>).detail)
    window.addEventListener('hearth:period', onPeriod)
    return () => window.removeEventListener('hearth:period', onPeriod)
  }, [])

  if (ctx.isLoading || summaryQuery.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>
          {getGreeting()}
          {greetingName ? `, ${greetingName}` : ''}
        </Title>
        <Button component={Link} to="/spending">
          + Quick add
        </Button>
      </Group>

      {summary && (
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Anchor component="button" type="button" onClick={() => shift(-1)} size="sm">
              ‹ Prev
            </Anchor>
            <Text size="sm" c="dimmed">
              {summary.period.start} – {summary.period.end}
            </Text>
            <Anchor component="button" type="button" onClick={() => shift(1)} size="sm">
              Next ›
            </Anchor>
          </Group>
          {periodStart && (
            <Anchor component="button" type="button" onClick={() => setPeriodStart(undefined)} size="sm">
              This period
            </Anchor>
          )}
        </Group>
      )}

      {summary && (
        <>
          <BacklogHeadline backlog={summary.backlog} money={money} />
          <SnapshotSection
            perPerson={summary.funding.perPerson}
            jointPotFundingTotal={summary.funding.jointPotFundingTotal}
            coupleSurplus={summary.coupleSurplus}
            money={money}
          />
          {accountsSummary.data && <NetWorthTile data={accountsSummary.data} money={money} />}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <AllocationCard allocation={summary.allocation} householdIncome={summary.householdPeriodIncome} money={money} />
            <TrendCard trend={summary.incomeTrend} money={money} />
          </SimpleGrid>
          <UpcomingCard upcoming={summary.upcoming} money={money} />
          <RecentActivityCard recent={summary.recentActivity} money={money} />
          <Group justify="flex-end">
            <Anchor component={Link} to="/funding" size="sm">
              View full funding plan →
            </Anchor>
          </Group>
        </>
      )}
    </Stack>
  )
}
