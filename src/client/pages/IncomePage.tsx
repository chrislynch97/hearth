import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import { formatMoney, toMinor } from '../../shared/money'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { useMoney } from '../useMoney'
import type { IncomeSource, Member } from '../../server/db/schema'

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_off', label: 'One-off' },
]

// ---------------------------------------------------------------------------
// Income sources
// ---------------------------------------------------------------------------

function IncomeSourceRow({ source, members }: { source: IncomeSource; members: Member[] }) {
  const money = useMoney()
  const utils = trpc.useUtils()
  const archive = trpc.incomeSources.archive.useMutation()
  const owner = members.find((m) => m.id === source.ownerId)
  const monthly = roundMinor(normaliseToMonthly(source.amount, source.recurrence as Recurrence))

  async function handleArchive() {
    await archive.mutateAsync({ id: source.id })
    await Promise.all([utils.incomeSources.list.invalidate(), utils.income.overview.invalidate()])
  }

  return (
    <Group justify="space-between" px="xs" py={6} wrap="nowrap">
      <Group gap="xs" wrap="wrap">
        <Text size="sm" fw={500}>
          {source.name}
        </Text>
        {owner && (
          <Badge size="sm" variant="light">
            {owner.displayName}
          </Badge>
        )}
        {source.basis === 'gross' && (
          <Badge size="sm" color="sand" variant="light" title="Gross sources aren't counted as spendable income">
            gross — not counted
          </Badge>
        )}
        {source.active === 0 && (
          <Badge size="sm" color="gray" variant="outline">
            inactive
          </Badge>
        )}
      </Group>
      <Group gap="md" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {formatMoney(source.amount, money)}
          {source.recurrence !== 'monthly' ? ` ${source.recurrence}` : ''} → {formatMoney(monthly, money)}/mo
        </Text>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          aria-label={`Archive ${source.name}`}
          onClick={() => void handleArchive()}
        >
          ×
        </ActionIcon>
      </Group>
    </Group>
  )
}

function AddIncomeSourceForm({ members }: { members: Member[] }) {
  const utils = trpc.useUtils()
  const money = useMoney()
  const create = trpc.incomeSources.create.useMutation()

  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amountMajor, setAmountMajor] = useState<number | string>('')
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly')
  const [basis, setBasis] = useState<'net' | 'gross'>('net')
  const [error, setError] = useState('')

  async function handleAdd() {
    if (!ownerId) return setError('Choose whose income this is.')
    if (!name.trim()) return setError('Enter a name.')
    if (amountMajor === '' || Number(amountMajor) <= 0) return setError('Enter an amount.')
    setError('')
    await create.mutateAsync({
      ownerId,
      name: name.trim(),
      amount: toMinor(Number(amountMajor), money.decimalPlaces),
      recurrence,
      basis,
    })
    await Promise.all([utils.incomeSources.list.invalidate(), utils.income.overview.invalidate()])
    setName('')
    setAmountMajor('')
  }

  return (
    <Stack gap="sm">
      <Divider label="Add income source" labelPosition="left" />
      <Group grow align="flex-end">
        <Select
          label="Whose"
          placeholder="Choose member"
          data={members.map((m) => ({ value: m.id, label: m.displayName }))}
          value={ownerId}
          onChange={(v) => {
            setOwnerId(v)
            setError('')
          }}
        />
        <TextInput
          label="Name"
          placeholder="e.g. Rental income"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </Group>
      <Group grow align="flex-end">
        <NumberInput
          label="Amount"
          placeholder="0.00"
          decimalScale={money.decimalPlaces}
          fixedDecimalScale
          min={0}
          value={amountMajor}
          onChange={setAmountMajor}
        />
        <Select
          label="Recurrence"
          data={RECURRENCE_OPTIONS}
          value={recurrence}
          onChange={(v) => setRecurrence((v as Recurrence) ?? 'monthly')}
          allowDeselect={false}
        />
        <Group align="flex-end">
          <Switch
            label="Gross"
            checked={basis === 'gross'}
            onChange={(e) => setBasis(e.currentTarget.checked ? 'gross' : 'net')}
          />
          <Button onClick={() => void handleAdd()} loading={create.isPending}>
            Add
          </Button>
        </Group>
      </Group>
      {(error || create.error) && (
        <Alert color="red" title="Error">
          {error || create.error?.message}
        </Alert>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// IncomePage
// ---------------------------------------------------------------------------

export function IncomePage() {
  const money = useMoney()
  const overviewQuery = trpc.income.overview.useQuery()
  const sourcesQuery = trpc.incomeSources.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()

  const overview = overviewQuery.data
  const sources = sourcesQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)

  const isLoading = overviewQuery.isLoading || membersQuery.isLoading

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Title order={2}>Income</Title>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && overview && (
        <>
          <Card withBorder padding="md">
            <Group justify="space-between" align="center">
              <Text fw={600}>Household monthly income</Text>
              <Text fw={700} size="lg">
                {formatMoney(overview.householdMonthlyIncome, money)}
              </Text>
            </Group>
          </Card>

          <Group grow align="stretch">
            {overview.perMember
              .filter((m) => m.kind === 'person' || m.monthlyIncome > 0)
              .map((m) => (
                <Card key={m.memberId} withBorder padding="md">
                  <Stack gap={6}>
                    <Title order={4}>{m.displayName}</Title>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        From payslips
                      </Text>
                      <Text size="sm">{formatMoney(m.salaryMonthly, money)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Other income
                      </Text>
                      <Text size="sm">{formatMoney(m.incomeSourceMonthly, money)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" fw={700}>
                        Monthly income
                      </Text>
                      <Text size="sm" fw={700}>
                        {formatMoney(m.monthlyIncome, money)}
                      </Text>
                    </Group>
                  </Stack>
                </Card>
              ))}
          </Group>

          <Card withBorder padding="md">
            <Stack gap="sm">
              <Title order={4}>Other income sources</Title>
              {sources.length === 0 && (
                <Text size="sm" c="dimmed">
                  No income sources yet. Salaried income comes from payslips; add anything else (rent,
                  benefits, side income) below.
                </Text>
              )}
              <Stack gap={2}>
                {sources.map((s) => (
                  <IncomeSourceRow key={s.id} source={s} members={members} />
                ))}
              </Stack>
              <AddIncomeSourceForm members={members} />
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
