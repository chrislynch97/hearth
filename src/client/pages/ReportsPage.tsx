import { useState } from 'react'
import {
  Anchor,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import type { inferRouterOutputs } from '@trpc/server'
import { trpc } from '../trpc'
import type { AppRouter } from '../../server/trpc/router'
import { formatMoney, fromMinor } from '../../shared/money'
import { periodForDate, shiftPeriod } from '../../shared/period'
import { downloadCsv } from '../csv'
import { useMoney } from '../useMoney'
import type { MoneyFormat } from '../useMoney'

function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="xs" variant="default" onClick={onClick}>
      Export CSV
    </Button>
  )
}

export function ReportsPage() {
  const money = useMoney()
  const ctx = trpc.bootstrap.context.useQuery()
  const startDay = ctx.data?.household?.budgetPeriodStartDay ?? 1
  const members = (ctx.data?.members ?? []).filter((m) => m.archivedAt === null)

  const [periodStart, setPeriodStart] = useState<string | undefined>(undefined)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [months, setMonths] = useState('6')

  const query = trpc.reports.overview.useQuery({
    ...(periodStart ? { periodStart } : {}),
    ...(ownerId ? { ownerId } : {}),
    months: Number(months),
  })
  const report = query.data
  const dp = money.decimalPlaces

  function shift(delta: number) {
    const base = report?.period ?? periodForDate(new Date().toISOString().slice(0, 10), startDay)
    setPeriodStart(shiftPeriod(base, delta, startDay).start)
  }

  return (
    <Stack gap="lg" maw={960} mx="auto">
      <Title order={2}>Reports</Title>

      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="xs" align="center">
          <Anchor component="button" type="button" onClick={() => shift(-1)} size="sm">
            ‹ Prev
          </Anchor>
          <Text size="sm" c="dimmed">
            {report ? `${report.period.start} – ${report.period.end}` : '…'}
          </Text>
          <Anchor component="button" type="button" onClick={() => shift(1)} size="sm">
            Next ›
          </Anchor>
          {periodStart && (
            <Anchor component="button" type="button" onClick={() => setPeriodStart(undefined)} size="sm">
              This period
            </Anchor>
          )}
        </Group>
        <Group gap="sm" align="flex-end">
          <Select
            label="Owner"
            placeholder="Everyone"
            size="xs"
            clearable
            data={members.map((m) => ({ value: m.id, label: m.displayName }))}
            value={ownerId}
            onChange={setOwnerId}
            w={160}
          />
          <SegmentedControl
            size="xs"
            value={months}
            onChange={setMonths}
            data={[
              { value: '3', label: '3m' },
              { value: '6', label: '6m' },
              { value: '12', label: '12m' },
            ]}
          />
        </Group>
      </Group>

      {query.isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {report && (
        <>
          <MonthlySpending report={report} money={money} dp={dp} />
          <SpendVsAllocation report={report} money={money} dp={dp} />
          <CategoryBreakdown report={report} money={money} dp={dp} />
          <PerMemberVsJoint report={report} money={money} dp={dp} />
          <MonthOverMonth report={report} money={money} dp={dp} />
        </>
      )}
    </Stack>
  )
}

type Report = inferRouterOutputs<AppRouter>['reports']['overview']

function monthLabel(month: string): string {
  // 'YYYY-MM' → 'Mon YY' (e.g. '2026-07' → 'Jul 26')
  const [y = '', m = ''] = month.split('-')
  const name = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)] ?? m
  return `${name} ${y.slice(2)}`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Card>
  )
}

function MonthlySpending({ report, money, dp }: { report: Report; money: MoneyFormat; dp: number }) {
  const { rows, average, highest, lowest } = report.monthlyTotals
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Monthly spending</Title>
        <ExportButton
          onClick={() =>
            downloadCsv('monthly-spending.csv', [
              ['Month', 'Total', 'Transactions', 'Change vs prev'],
              ...rows.map((r) => [
                r.month,
                fromMinor(r.total, dp),
                r.count,
                r.change === null ? '' : fromMinor(r.change, dp),
              ]),
            ])
          }
        />
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" mb="md">
        <Stat label="Avg / month" value={formatMoney(average, money)} sub="over the window" />
        <Stat
          label="Highest"
          value={highest ? formatMoney(highest.total, money) : '—'}
          sub={highest ? monthLabel(highest.month) : undefined}
        />
        <Stat
          label="Lowest"
          value={lowest ? formatMoney(lowest.total, money) : '—'}
          sub={lowest ? monthLabel(lowest.month) : undefined}
        />
      </SimpleGrid>

      {rows.every((r) => r.count === 0) ? (
        <Text size="sm" c="dimmed">
          No spending in this window.
        </Text>
      ) : (
        <>
          <Stack gap={6} mb="md">
            {rows.map((r) => (
              <Group key={r.month} gap="sm" wrap="nowrap">
                <Text size="xs" c="dimmed" w={52} style={{ flexShrink: 0 }}>
                  {monthLabel(r.month)}
                </Text>
                <div
                  style={{
                    flex: 1,
                    height: 18,
                    borderRadius: 4,
                    background: 'var(--mantine-color-default-hover)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(r.total / max) * 100}%`,
                      height: '100%',
                      background: 'var(--mantine-color-moss-5, var(--mantine-primary-color-filled))',
                    }}
                  />
                </div>
                <Text size="xs" ta="right" w={90} style={{ flexShrink: 0 }}>
                  {r.total === 0 ? '—' : formatMoney(r.total, money)}
                </Text>
              </Group>
            ))}
          </Stack>

          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Month</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Transactions</Table.Th>
                <Table.Th ta="right">Change</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.month}>
                  <Table.Td>{monthLabel(r.month)}</Table.Td>
                  <Table.Td ta="right">{r.total === 0 ? '—' : formatMoney(r.total, money)}</Table.Td>
                  <Table.Td ta="right" c="dimmed">
                    {r.count}
                  </Table.Td>
                  <Table.Td ta="right" c={r.change === null || r.change === 0 ? 'dimmed' : r.change > 0 ? 'red' : 'moss'}>
                    {r.change === null
                      ? '—'
                      : `${r.change > 0 ? '+' : r.change < 0 ? '−' : ''}${formatMoney(Math.abs(r.change), money)}`}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Card>
  )
}

function SpendVsAllocation({ report, money, dp }: { report: Report; money: MoneyFormat; dp: number }) {
  const rows = report.spendVsAllocation
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Spend vs allocation</Title>
        <ExportButton
          onClick={() =>
            downloadCsv('spend-vs-allocation.csv', [
              ['Category', 'Planned', 'Actual', 'Difference'],
              ...rows.map((r) => [r.name, fromMinor(r.planned, dp), fromMinor(r.actual, dp), fromMinor(r.diff, dp)]),
            ])
          }
        />
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No allocation or spend yet.
        </Text>
      ) : (
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th ta="right">Planned</Table.Th>
              <Table.Th ta="right">Actual</Table.Th>
              <Table.Th ta="right">Difference</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.categoryId ?? 'uncat'}>
                <Table.Td>{r.name}</Table.Td>
                <Table.Td ta="right">{formatMoney(r.planned, money)}</Table.Td>
                <Table.Td ta="right">{formatMoney(r.actual, money)}</Table.Td>
                <Table.Td ta="right" c={r.diff < 0 ? 'red' : undefined}>
                  {formatMoney(r.diff, money)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

function CategoryBreakdown({ report, money, dp }: { report: Report; money: MoneyFormat; dp: number }) {
  const { rows, total } = report.categoryBreakdown
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Category breakdown</Title>
        <ExportButton
          onClick={() =>
            downloadCsv('category-breakdown.csv', [
              ['Category', 'Spent', '% of spend'],
              ...rows.map((r) => [r.name, fromMinor(r.spent, dp), pct(r.spent, total)]),
            ])
          }
        />
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No spending in this period.
        </Text>
      ) : (
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th ta="right">Spent</Table.Th>
              <Table.Th ta="right">% of spend</Table.Th>
              <Table.Th ta="right">% of income</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.categoryId ?? 'uncat'}>
                <Table.Td>{r.name}</Table.Td>
                <Table.Td ta="right">{formatMoney(r.spent, money)}</Table.Td>
                <Table.Td ta="right" c="dimmed">
                  {pct(r.spent, total)}
                </Table.Td>
                <Table.Td ta="right" c="dimmed">
                  {pct(r.spent, report.householdMonthlyIncome)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  )
}

function PerMemberVsJoint({ report, money, dp }: { report: Report; money: MoneyFormat; dp: number }) {
  const rows = report.perMemberVsJoint
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Per-member vs joint</Title>
        <ExportButton
          onClick={() =>
            downloadCsv('per-member-vs-joint.csv', [
              ['Member', 'Type', 'Monthly outgoing cost'],
              ...rows.map((r) => [r.displayName, r.kind, fromMinor(r.monthlyCost, dp)]),
            ])
          }
        />
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Each member's share of the monthly outgoings — the fairness lens.
      </Text>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Member</Table.Th>
            <Table.Th ta="right">Monthly cost</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.ownerId}>
              <Table.Td>{r.displayName}</Table.Td>
              <Table.Td ta="right">{formatMoney(r.monthlyCost, money)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

function MonthOverMonth({ report, money, dp }: { report: Report; money: MoneyFormat; dp: number }) {
  const { months, rows } = report.monthOverMonth
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Month over month</Title>
        <ExportButton
          onClick={() =>
            downloadCsv('month-over-month.csv', [
              ['Category', ...months],
              ...rows.map((r) => [r.name, ...r.byMonth.map((v) => fromMinor(v, dp))]),
            ])
          }
        />
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No spending in this window.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={120 + months.length * 70}>
          <Table verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                {months.map((m) => (
                  <Table.Th key={m} ta="right">
                    {m.slice(2)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.categoryId ?? 'uncat'}>
                  <Table.Td>{r.name}</Table.Td>
                  {r.byMonth.map((v, i) => (
                    <Table.Td key={i} ta="right" c={v === 0 ? 'dimmed' : undefined}>
                      {v === 0 ? '—' : formatMoney(v, money)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  )
}
