import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { DatesProvider, Month } from '@mantine/dates'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { useMoney, useFormatDate, useWeekStart } from '../useMoney'
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

export function UpcomingPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const weekStart = useWeekStart()
  const [horizon, setHorizon] = useState('60')
  const [selected, setSelected] = useState<string | null>(null)
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

  // A payment day renders the date number plus a coloured dot (apricot = due
  // soon, moss otherwise). renderDay REPLACES the default number, so we draw it.
  const renderDay = (dateStr: string) => {
    const day = Number(dateStr.slice(8, 10))
    const dayPayments = byDate.get(dateStr)
    if (!dayPayments) return day
    const dueSoon = dayPayments.some((p) => p.dueSoon)
    const isSelected = dateStr === selected
    const dotColor = isSelected ? 'white' : dueSoon ? hearthTokens.brand.apricot : hearthTokens.brand.moss
    return (
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <span style={{ fontWeight: 600 }}>{day}</span>
        <span
          style={{
            position: 'absolute',
            bottom: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: dotColor,
          }}
        />
      </div>
    )
  }

  // Only payment days are interactive: clicking one selects it (filtering the
  // schedule below); clicking again clears. Non-payment days get no props.
  const getDayProps = (dateStr: string) => {
    const dayPayments = byDate.get(dateStr)
    if (!dayPayments) return {}
    const dueSoon = dayPayments.some((p) => p.dueSoon)
    const isSelected = dateStr === selected
    return {
      selected: isSelected,
      onClick: () => setSelected((cur) => (cur === dateStr ? null : dateStr)),
      title: dayPayments.map((p) => `${p.name}: ${formatMoney(p.amount, money)}`).join('\n'),
      style: isSelected
        ? undefined
        : {
            backgroundColor: dueSoon
              ? `light-dark(${hearthTokens.surface.warmTint}, rgba(217,140,95,0.14))`
              : 'light-dark(var(--mantine-color-moss-0), rgba(106,145,87,0.14))',
            border: `1px solid ${dueSoon ? hearthTokens.brand.apricot : hearthTokens.brand.moss}44`,
          },
    }
  }

  const selectedPayments = selected ? byDate.get(selected) ?? [] : []
  const selectedTotal = selectedPayments.reduce((acc, p) => acc + p.amount, 0)

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Upcoming payments</Title>
        <SegmentedControl
          size="xs"
          value={horizon}
          onChange={(v) => {
            setHorizon(v)
            setSelected(null)
          }}
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

          <DatesProvider settings={{ consistentWeeks: true }}>
            <Group grow align="flex-start" wrap="wrap">
              {months.map((m) => (
                <Card key={`${m.year}-${m.month}`} withBorder padding="sm" radius="md">
                  <Text fw={600} size="sm" mb="xs">
                    {MONTH_NAMES[m.month]} {m.year}
                  </Text>
                  <Month
                    month={`${m.year}-${pad(m.month + 1)}-01`}
                    firstDayOfWeek={weekStart === 'sunday' ? 0 : 1}
                    hideOutsideDates
                    highlightToday
                    fullWidth
                    size="md"
                    renderDay={renderDay}
                    getDayProps={getDayProps}
                  />
                </Card>
              ))}
            </Group>
          </DatesProvider>

          {selected && (
            <Card withBorder padding="md" radius="md" style={{ borderColor: hearthTokens.brand.moss }}>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>{fmt(selected)}</Text>
                <Button variant="subtle" size="xs" onClick={() => setSelected(null)}>
                  Clear
                </Button>
              </Group>
              <Stack gap={4}>
                {selectedPayments.map((p, i) => (
                  <Group key={`${p.expenseId}-${i}`} justify="space-between" px="xs" py={4}>
                    <Group gap="xs">
                      <Text size="sm">{p.name}</Text>
                      <Badge size="sm" variant="light" color={p.dueSoon ? 'apricot' : 'gray'}>
                        {p.daysUntil === 0 ? 'today' : `in ${p.daysUntil}d`}
                      </Badge>
                    </Group>
                    <Text size="sm">{formatMoney(p.amount, money)}</Text>
                  </Group>
                ))}
              </Stack>
              {selectedPayments.length > 1 && (
                <Group justify="space-between" px="xs" mt={4}>
                  <Text size="sm" c="dimmed">
                    Total
                  </Text>
                  <Text size="sm" fw={600}>
                    {formatMoney(selectedTotal, money)}
                  </Text>
                </Group>
              )}
            </Card>
          )}

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
