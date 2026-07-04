import { useState } from 'react'
import {
  Badge,
  Box,
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
import { useMoney, useFormatDate, useWeekStart } from '../useMoney'
import type { MoneyFormat } from '../useMoney'
import { hearthTokens } from '../theme'

interface Payment {
  expenseId: string
  name: string
  date: string
  amount: number
  daysUntil: number
  dueSoon: boolean
}

const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number) => String(n).padStart(2, '0')

function monthsBetween(from: string, to: string): Array<{ year: number; month: number }> {
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  const result: Array<{ year: number; month: number }> = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    result.push({ year: y, month: m - 1 }) // month 0-indexed
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return result
}

function CalendarMonth({
  year,
  month,
  byDate,
  money,
  weekStart,
}: {
  year: number
  month: number
  byDate: Map<string, Payment[]>
  money: MoneyFormat
  weekStart: 'monday' | 'sunday'
}) {
  const weekdays = weekStart === 'sunday' ? WEEKDAYS_SUN : WEEKDAYS_MON
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay() // 0 = Sun
  const firstWeekday = weekStart === 'sunday' ? dow : (dow + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  // Always render 6 week rows (42 cells) so every month is the same height.
  const days: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const cells: Array<number | null> = [...days, ...Array(Math.max(0, 42 - days.length)).fill(null)]

  return (
    <Card withBorder padding="sm" radius="md">
      <Text fw={600} size="sm" mb="xs">
        {MONTH_NAMES[month]} {year}
      </Text>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {weekdays.map((d) => (
          <Text key={d} size="9px" c="dimmed" ta="center" fw={700}>
            {d}
          </Text>
        ))}
      </Box>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '40px', gap: 4 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
          const payments = byDate.get(dateStr)
          const dueSoon = payments?.some((p) => p.dueSoon)
          const total = payments?.reduce((acc, p) => acc + p.amount, 0) ?? 0
          return (
            <Box
              key={dateStr}
              title={payments ? payments.map((p) => `${p.name}: ${formatMoney(p.amount, money)}`).join('\n') : undefined}
              style={{
                borderRadius: 6,
                padding: 3,
                fontSize: 10,
                backgroundColor: payments
                  ? dueSoon
                    ? `light-dark(${hearthTokens.surface.warmTint}, rgba(217,140,95,0.14))`
                    : 'light-dark(var(--mantine-color-moss-0), rgba(106,145,87,0.14))'
                  : 'transparent',
                border: payments ? `1px solid ${dueSoon ? hearthTokens.brand.apricot : hearthTokens.brand.moss}44` : '1px solid transparent',
              }}
            >
              <Text size="10px" c={payments ? undefined : 'dimmed'} fw={payments ? 600 : 400}>
                {day}
              </Text>
              {payments && (
                <Text size="9px" c="dimmed" style={{ lineHeight: 1.1 }}>
                  {formatMoney(total, money)}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    </Card>
  )
}

export function UpcomingPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const weekStart = useWeekStart()
  const [horizon, setHorizon] = useState('60')
  const query = trpc.plan.upcoming.useQuery({ horizonDays: Number(horizon) })
  const data = query.data
  const payments = (data?.payments ?? []) as Payment[]

  const byDate = new Map<string, Payment[]>()
  for (const p of payments) {
    const arr = byDate.get(p.date) ?? []
    arr.push(p)
    byDate.set(p.date, arr)
  }
  const total = payments.reduce((acc, p) => acc + p.amount, 0)
  const months = data ? monthsBetween(data.from, data.to) : []

  return (
    <Stack gap="lg" maw={900} mx="auto">
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

          <Group grow align="flex-start" wrap="wrap">
            {months.map((m) => (
              <CalendarMonth
                key={`${m.year}-${m.month}`}
                year={m.year}
                month={m.month}
                byDate={byDate}
                money={money}
                weekStart={weekStart}
              />
            ))}
          </Group>

          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
              Schedule
            </Title>
            <Stack gap={4}>
              {payments.map((p, i) => (
                <Group key={`${p.expenseId}-${i}`} justify="space-between" px="xs" py={4}>
                  <Group gap="xs">
                    <Text size="sm">{p.name}</Text>
                    <Text size="xs" c="dimmed">
                      {fmt(p.date)}
                    </Text>
                    <Badge size="sm" variant="light" color={p.dueSoon ? 'apricot' : 'gray'}>
                      {p.daysUntil === 0 ? 'today' : `in ${p.daysUntil}d`}
                    </Badge>
                  </Group>
                  <Text size="sm">{formatMoney(p.amount, money)}</Text>
                </Group>
              ))}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
