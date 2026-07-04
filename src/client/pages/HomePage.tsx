import { useState } from 'react'
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
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router-dom'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { periodForDate, shiftPeriod } from '../../shared/period'
import { useMoney } from '../useMoney'
import { hearthTokens } from '../theme'
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
  perPerson: Array<{ memberId: string; displayName: string; monthlyIncome: number; setAside: number; remainder: number }>
  jointPotFundingTotal: number
  coupleSurplus: number
  money: MoneyFormat
}) {
  if (perPerson.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Set up your outgoings and income to see your monthly snapshot here.
      </Text>
    )
  }
  return (
    <Stack gap="sm">
      <Group grow align="stretch">
        {perPerson.map((p) => (
          <Card key={p.memberId} withBorder padding="md" radius="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" ff="monospace" lts="0.05em" mb={6}>
              {p.displayName}
            </Text>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Income
              </Text>
              <Text size="sm">{formatMoney(p.monthlyIncome, money)}</Text>
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
      </Group>
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
  const max = Math.max(1, ...trend.map((m) => m.net))
  const hasData = trend.some((m) => m.net > 0)
  if (!hasData) return null
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Net income · last 12 months
      </Title>
      <Group gap={6} align="flex-end" h={90} wrap="nowrap">
        {trend.map((m) => (
          <Box key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Box
              title={`${m.month}: ${formatMoney(m.net, money)}`}
              style={{
                width: '100%',
                height: `${Math.max(2, (m.net / max) * 70)}px`,
                borderRadius: 3,
                backgroundColor: m.net > 0 ? hearthTokens.brand.moss : 'var(--mantine-color-gray-4)',
              }}
            />
            <Text size="9px" c="dimmed">
              {m.month.slice(5)}
            </Text>
          </Box>
        ))}
      </Group>
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
  const potsQuery = trpc.pots.list.useQuery()
  const update = trpc.spends.update.useMutation()
  const pots = potsQuery.data ?? []

  if (recent.length === 0) return null

  async function assign(spendId: string, potId: string | null) {
    if (!potId) return
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
                {r.date}
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
  const startDay = ctx.data?.household?.budgetPeriodStartDay ?? 1

  const [periodStart, setPeriodStart] = useState<string | undefined>(undefined)
  const summaryQuery = trpc.dashboard.summary.useQuery(periodStart ? { periodStart } : undefined)
  const accountsSummary = trpc.accounts.summary.useQuery()

  const householdName = ctx.data?.household?.displayName
  const summary = summaryQuery.data

  function shift(delta: number) {
    const base = summary?.period ?? periodForDate(new Date().toISOString().slice(0, 10), startDay)
    setPeriodStart(shiftPeriod(base, delta, startDay).start)
  }

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
          {householdName ? `, ${householdName}` : ''}
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
          <Group grow align="stretch" wrap="wrap">
            <AllocationCard allocation={summary.allocation} householdIncome={summary.householdMonthlyIncome} money={money} />
            <TrendCard trend={summary.incomeTrend} money={money} />
          </Group>
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
