import { useState } from 'react'
import {
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { useMoney, useFormatDate } from '../useMoney'
import { hearthTokens } from '../theme'

interface Payment {
  expenseId: string
  name: string
  date: string
  amount: number
  daysUntil: number
  dueSoon: boolean
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Weekday abbreviation for a `YYYY-MM-DD` date, parsed without timezone drift. */
function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]!
}

interface MonthGroup {
  key: string
  label: string
  items: Payment[]
  total: number
}

/** Bucket payments into consecutive month sections, preserving date order. */
function groupByMonth(payments: Payment[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  const byKey = new Map<string, MonthGroup>()
  for (const p of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = p.date.slice(0, 7)
    let group = byKey.get(key)
    if (!group) {
      const [y, m] = key.split('-').map(Number) as [number, number]
      group = { key, label: `${MONTH_NAMES[m - 1]} ${y}`, items: [], total: 0 }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(p)
    group.total += p.amount
  }
  return groups
}

export function UpcomingPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const [horizon, setHorizon] = useState('60')
  const query = trpc.plan.upcoming.useQuery({ horizonDays: Number(horizon) })
  const data = query.data
  const payments = (data?.payments ?? []) as Payment[]

  const total = payments.reduce((acc, p) => acc + p.amount, 0)
  const groups = groupByMonth(payments)

  return (
    <Stack gap="lg" maw={640} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Upcoming payments</Title>
        <SegmentedControl
          size="xs"
          value={horizon}
          onChange={setHorizon}
          data={[
            { value: '30', label: '30d' },
            { value: '60', label: '60d' },
            { value: '90', label: '90d' },
          ]}
        />
      </Group>

      {query.isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {data && payments.length === 0 && (
        <Text c="dimmed">
          No bills due in the next {horizon} days. Add a due date to an outgoing to see it here.
        </Text>
      )}

      {data && payments.length > 0 && (
        <>
          <Text size="sm" c="dimmed">
            {formatMoney(total, money)} across {payments.length} payment{payments.length === 1 ? '' : 's'} in the next {horizon} days.
          </Text>

          <Stack gap="lg">
            {groups.map((group) => (
              <Card key={group.key} withBorder padding="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{group.label}</Text>
                  <Text size="sm" c="dimmed">
                    {formatMoney(group.total, money)}
                  </Text>
                </Group>
                <Stack gap={0}>
                  {group.items.map((p, i) => (
                    <Group
                      key={`${p.expenseId}-${i}`}
                      wrap="nowrap"
                      gap="md"
                      py="xs"
                      px="xs"
                      align="center"
                      style={{
                        borderTop: i === 0 ? undefined : '1px solid light-dark(var(--mantine-color-sand-2), var(--mantine-color-dark-5))',
                        borderLeft: `2px solid ${p.dueSoon ? hearthTokens.brand.apricot : 'transparent'}`,
                      }}
                      title={fmt(p.date)}
                    >
                      <Stack gap={0} align="center" style={{ width: 34, flexShrink: 0 }}>
                        <Text fw={700} size="lg" lh={1}>
                          {Number(p.date.slice(8, 10))}
                        </Text>
                        <Text size="xs" c="dimmed" lh={1.2}>
                          {weekdayOf(p.date)}
                        </Text>
                      </Stack>
                      <Text size="sm" fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                        {p.name}
                      </Text>
                      <Badge size="sm" variant="light" color={p.dueSoon ? 'apricot' : 'gray'} style={{ flexShrink: 0 }}>
                        {p.daysUntil === 0 ? 'today' : `in ${p.daysUntil}d`}
                      </Badge>
                      <Text size="sm" fw={600} ta="right" style={{ width: 88, flexShrink: 0 }}>
                        {formatMoney(p.amount, money)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  )
}
