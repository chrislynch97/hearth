import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { formatMoney, toMinor } from '../../shared/money'
import { useMoney, useFormatDate } from '../useMoney'
import { hearthTokens, chartXAxisProps } from '../theme'
import type { MoneyFormat } from '../useMoney'
import type { Account } from '../../server/db/schema'
import type { AccountWithValue } from '../../server/routers/accounts'

// Subtype options offered per kind. Purely descriptive — net worth uses `kind`.
const SUBTYPES: Record<'asset' | 'liability', { value: string; label: string }[]> = {
  asset: [
    { value: 'savings', label: 'Savings' },
    { value: 'pension', label: 'Pension' },
    { value: 'investment', label: 'Investment' },
    { value: 'property', label: 'Property' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
  ],
  liability: [
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'student_loan', label: 'Student loan' },
    { value: 'loan', label: 'Loan' },
    { value: 'credit_card', label: 'Credit card' },
    { value: 'other', label: 'Other' },
  ],
}

const subtypeLabel = (kind: string, value: string | null): string | null => {
  if (!value) return null
  return SUBTYPES[kind as 'asset' | 'liability']?.find((s) => s.value === value)?.label ?? value
}

// A balance older than this is flagged as stale — net worth may be out of date.
const STALE_DAYS = 90

function daysSince(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return 0
  return Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000)
}

function ageLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 31) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// ---------------------------------------------------------------------------
// Net worth headline + trend
// ---------------------------------------------------------------------------

function NetWorthHeadline({
  assets,
  liabilities,
  netWorth,
  money,
}: {
  assets: number
  liabilities: number
  netWorth: number
  money: MoneyFormat
}) {
  const negative = netWorth < 0
  return (
    <Card
      padding="lg"
      radius="lg"
      style={{
        backgroundColor: 'light-dark(var(--mantine-color-moss-0), var(--mantine-color-dark-6))',
        border: `1px solid ${hearthTokens.brand.moss}33`,
      }}
    >
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" ff="monospace" lts="0.05em" mb={4}>
        Net worth
      </Text>
      <Text
        fw={700}
        fz={40}
        c={negative ? 'red' : undefined}
        style={{ fontFamily: 'var(--mantine-font-family-headings)', lineHeight: 1.1 }}
      >
        {formatMoney(netWorth, money)}
      </Text>
      <Group gap="xl" mt="sm">
        <Group gap={6}>
          <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: hearthTokens.brand.moss }} />
          <Text size="sm" c="dimmed">
            Assets {formatMoney(assets, money)}
          </Text>
        </Group>
        <Group gap={6}>
          <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: hearthTokens.brand.apricot }} />
          <Text size="sm" c="dimmed">
            Liabilities {formatMoney(liabilities, money)}
          </Text>
        </Group>
      </Group>
    </Card>
  )
}

function TrendCard({
  timeline,
  money,
}: {
  timeline: Array<{ date: string; netWorth: number }>
  money: MoneyFormat
}) {
  if (timeline.length < 2) return null
  // YY-MM labels; recharts thins them automatically when there are many points.
  const data = timeline.map((p) => ({ date: p.date.slice(2, 7), netWorth: p.netWorth }))
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Net worth over time
      </Title>
      <AreaChart
        h={180}
        data={data}
        dataKey="date"
        // Net worth can dip below zero — split the fill so negative stretches
        // read apricot (a liability warning) and positive reads moss.
        type="split"
        splitColors={[hearthTokens.brand.moss, hearthTokens.brand.apricot]}
        series={[{ name: 'netWorth', label: 'Net worth', color: hearthTokens.brand.moss }]}
        valueFormatter={(v) => formatMoney(v, money)}
        withDots={false}
        yAxisProps={{ width: 76 }}
        xAxisProps={chartXAxisProps}
        gridAxis="y"
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Account create/edit modal
// ---------------------------------------------------------------------------

interface OwnerOption {
  value: string
  label: string
}

function AccountModal({
  opened,
  onClose,
  account,
  owners,
  defaultKind,
}: {
  opened: boolean
  onClose: () => void
  account: Account | null
  owners: OwnerOption[]
  defaultKind: 'asset' | 'liability'
}) {
  const utils = trpc.useUtils()
  const create = trpc.accounts.create.useMutation()
  const update = trpc.accounts.update.useMutation()
  const isEditing = account !== null

  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<'asset' | 'liability'>((account?.kind as 'asset' | 'liability') ?? defaultKind)
  const [subtype, setSubtype] = useState<string | null>(account?.subtype ?? null)
  const [ownerId, setOwnerId] = useState<string | null>(account?.ownerId ?? owners[0]?.value ?? null)
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [note, setNote] = useState(account?.note ?? '')
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!name.trim()) return setError('Give the account a name.')
    if (!ownerId) return setError('Choose an owner.')
    setError('')
    const payload = {
      name: name.trim(),
      kind,
      subtype: subtype ?? null,
      institution: institution.trim() || null,
      note: note.trim() || null,
    }
    if (isEditing) await update.mutateAsync({ id: account.id, ownerId, ...payload })
    else await create.mutateAsync({ ownerId, ...payload })
    await Promise.all([utils.accounts.list.invalidate(), utils.accounts.summary.invalidate()])
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit account' : 'Add account'} size="md">
      <Stack
        gap="sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
            void handleSubmit()
          }
        }}
      >
        <TextInput
          label="Name"
          placeholder="e.g. Barclays mortgage"
          data-autofocus
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <SegmentedControl
          value={kind}
          onChange={(v) => {
            setKind(v as 'asset' | 'liability')
            setSubtype(null)
          }}
          data={[
            { value: 'asset', label: 'Asset' },
            { value: 'liability', label: 'Liability' },
          ]}
        />
        <Select
          label="Type"
          placeholder="Choose a type"
          value={subtype}
          onChange={setSubtype}
          data={SUBTYPES[kind]}
          clearable
        />
        <Select label="Owner" value={ownerId} onChange={setOwnerId} data={owners} allowDeselect={false} />
        <TextInput
          label="Institution (optional)"
          placeholder="e.g. Vanguard"
          value={institution}
          onChange={(e) => setInstitution(e.currentTarget.value)}
        />
        <TextInput label="Note (optional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        {(error || create.error || update.error) && (
          <Alert color="red" title="Error">
            {error || create.error?.message || update.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={create.isPending || update.isPending}>
            {isEditing ? 'Save' : 'Add account'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Balance history / add modal
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function BalancesModal({
  opened,
  onClose,
  account,
  money,
}: {
  opened: boolean
  onClose: () => void
  account: AccountWithValue
  money: MoneyFormat
}) {
  const utils = trpc.useUtils()
  const fmt = useFormatDate()
  const balancesQuery = trpc.accounts.balances.useQuery({ accountId: account.id }, { enabled: opened })
  const addBalance = trpc.accounts.addBalance.useMutation()
  const removeBalance = trpc.accounts.removeBalance.useMutation()

  const [asOfDate, setAsOfDate] = useState(today())
  const [valueMajor, setValueMajor] = useState<number | string>('')
  const [error, setError] = useState('')

  const ascending = balancesQuery.data ?? []
  const balances = [...ascending].reverse() // newest first for display
  // Change vs the previous (older) snapshot, keyed by balance id.
  const deltaById = new Map<string, { delta: number; pct: number | null }>()
  ascending.forEach((b, i) => {
    const prev = ascending[i - 1]
    if (!prev) return
    const delta = b.value - prev.value
    deltaById.set(b.id, { delta, pct: prev.value !== 0 ? (delta / prev.value) * 100 : null })
  })

  async function refresh() {
    await Promise.all([
      utils.accounts.balances.invalidate({ accountId: account.id }),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
    ])
  }

  async function handleAdd() {
    if (!asOfDate) return setError('Choose a date.')
    if (valueMajor === '' || Number.isNaN(Number(valueMajor))) return setError('Enter the balance.')
    setError('')
    await addBalance.mutateAsync({
      accountId: account.id,
      asOfDate,
      value: toMinor(Number(valueMajor), money.decimalPlaces),
    })
    setValueMajor('')
    await refresh()
  }

  async function handleRemove(id: string) {
    await removeBalance.mutateAsync({ id })
    await refresh()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${account.name} — balances`} size="lg">
      <Stack gap="md">
        <Group
          align="flex-end"
          gap="sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleAdd()
            }
          }}
        >
          <TextInput
            label="As of"
            type="date"
            data-autofocus
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.currentTarget.value)}
          />
          <NumberInput
            label={`Balance${account.kind === 'liability' ? ' owed' : ''}`}
            placeholder="0.00"
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            thousandSeparator=","
            value={valueMajor}
            onChange={setValueMajor}
            style={{ flex: 1 }}
          />
          <Button onClick={() => void handleAdd()} loading={addBalance.isPending}>
            Add
          </Button>
        </Group>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {balancesQuery.isLoading ? (
          <Center>
            <Loader size="sm" />
          </Center>
        ) : balances.length === 0 ? (
          <Text c="dimmed" size="sm">
            No balances yet. Add today's value to start the history.
          </Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Balance</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Change</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {balances.map((b) => {
                const change = deltaById.get(b.id)
                // "Good" = wealth moving the right way: assets up, or debts down.
                const good = change ? (account.kind === 'asset' ? change.delta > 0 : change.delta < 0) : false
                const flat = change ? change.delta === 0 : false
                return (
                  <Table.Tr key={b.id}>
                    <Table.Td>{fmt(b.asOfDate)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(b.value, money)}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {!change ? (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      ) : (
                        <Text size="xs" c={flat ? 'dimmed' : good ? hearthTokens.semantic.positive : 'red'}>
                          {change.delta > 0 ? '+' : ''}
                          {formatMoney(change.delta, money)}
                          {change.pct !== null ? ` (${change.pct > 0 ? '+' : ''}${change.pct.toFixed(1)}%)` : ''}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        aria-label="Delete balance"
                        onClick={() => void handleRemove(b.id)}
                      >
                        ×
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Account group table
// ---------------------------------------------------------------------------

function AccountGroup({
  title,
  accounts,
  ownerName,
  total,
  money,
  onAdd,
  onEdit,
  onBalances,
  onDelete,
}: {
  title: string
  accounts: AccountWithValue[]
  ownerName: (id: string) => string
  total: number
  money: MoneyFormat
  onAdd: () => void
  onEdit: (a: AccountWithValue) => void
  onBalances: (a: AccountWithValue) => void
  onDelete: (a: AccountWithValue) => void
}) {
  const fmt = useFormatDate()
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Group gap="md">
          <Text fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(total, money)}
          </Text>
          <Button size="xs" variant="light" onClick={onAdd}>
            + Add
          </Button>
        </Group>
      </Group>
      {accounts.length === 0 ? (
        <Text c="dimmed" size="sm">
          None yet.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>Account</Table.Th>
                <Table.Th>Owner</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>As of</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Value</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>{a.name}</Text>
                      {subtypeLabel(a.kind, a.subtype) && (
                        <Badge size="xs" variant="light" color="gray">
                          {subtypeLabel(a.kind, a.subtype)}
                        </Badge>
                      )}
                      {a.institution && (
                        <Text size="xs" c="dimmed">
                          {a.institution}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {ownerName(a.ownerId)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {a.asOfDate === null ? (
                      <Badge size="xs" variant="light" color="apricot">
                        no data
                      </Badge>
                    ) : (
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed">
                          {fmt(a.asOfDate)}
                        </Text>
                        {daysSince(a.asOfDate) > STALE_DAYS && (
                          <Badge size="xs" variant="light" color="apricot" title={ageLabel(daysSince(a.asOfDate))}>
                            stale
                          </Badge>
                        )}
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {a.currentValue === null ? (
                      <Text size="sm" c="dimmed">
                        no data
                      </Text>
                    ) : (
                      formatMoney(a.currentValue, money)
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" onClick={() => onBalances(a)}>
                        Balances
                      </Button>
                      <ActionIcon variant="subtle" size="sm" aria-label="Edit account" onClick={() => onEdit(a)}>
                        ✎
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        aria-label="Delete account"
                        onClick={() => onDelete(a)}
                      >
                        ×
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AccountsPage() {
  const money = useMoney()
  const utils = trpc.useUtils()
  const membersQuery = trpc.members.list.useQuery()
  const accountsQuery = trpc.accounts.list.useQuery()
  const summaryQuery = trpc.accounts.summary.useQuery()
  const remove = trpc.accounts.remove.useMutation()

  const owners: OwnerOption[] = (membersQuery.data ?? [])
    .filter((m) => m.archivedAt === null)
    .map((m) => ({ value: m.id, label: m.displayName }))
  const ownerName = (id: string) => owners.find((o) => o.value === id)?.label ?? '—'

  const accounts = accountsQuery.data ?? []
  const assets = useMemo(() => accounts.filter((a) => a.kind === 'asset'), [accounts])
  const liabilities = useMemo(() => accounts.filter((a) => a.kind === 'liability'), [accounts])
  const staleCount = accounts.filter((a) => a.asOfDate === null || daysSince(a.asOfDate) > STALE_DAYS).length

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [modalKind, setModalKind] = useState<'asset' | 'liability'>('asset')
  const [balancesFor, setBalancesFor] = useState<AccountWithValue | null>(null)

  function openAdd(kind: 'asset' | 'liability') {
    setEditing(null)
    setModalKind(kind)
    setModalOpen(true)
  }
  function openEdit(a: AccountWithValue) {
    setEditing(a)
    setModalOpen(true)
  }
  async function handleDelete(a: AccountWithValue) {
    const msg = a.currentValue !== null
      ? `Delete "${a.name}" and its balance history? This can't be undone.`
      : `Delete "${a.name}"?`
    if (!window.confirm(msg)) return
    await remove.mutateAsync({ id: a.id })
    await Promise.all([utils.accounts.list.invalidate(), utils.accounts.summary.invalidate()])
  }

  const summary = summaryQuery.data
  const isLoading = accountsQuery.isLoading || summaryQuery.isLoading

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Accounts &amp; net worth</Title>
        <Button onClick={() => openAdd('asset')}>+ Add account</Button>
      </Group>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && summary && (
        <>
          <NetWorthHeadline
            assets={summary.assets}
            liabilities={summary.liabilities}
            netWorth={summary.netWorth}
            money={money}
          />
          <TrendCard timeline={summary.timeline} money={money} />
        </>
      )}

      {!isLoading && accounts.length > 0 && staleCount > 0 && (
        <Alert color="apricot" variant="light" title="Some balances are out of date">
          {staleCount} account{staleCount === 1 ? '' : 's'} {staleCount === 1 ? "hasn't" : "haven't"} been
          updated in over {Math.round(STALE_DAYS / 30)} months — your net worth may be stale. Open an
          account's balances to record a current value.
        </Alert>
      )}

      {!isLoading && accounts.length === 0 && (
        <Text c="dimmed">
          Track the things you own and owe — savings, pensions, property, mortgage, loans — and Hearth charts your
          net worth over time. Add your first account to begin.
        </Text>
      )}

      {!isLoading && accounts.length > 0 && (
        <>
          <AccountGroup
            title="Assets"
            accounts={assets}
            ownerName={ownerName}
            total={summary?.assets ?? 0}
            money={money}
            onAdd={() => openAdd('asset')}
            onEdit={openEdit}
            onBalances={setBalancesFor}
            onDelete={handleDelete}
          />
          <AccountGroup
            title="Liabilities"
            accounts={liabilities}
            ownerName={ownerName}
            total={summary?.liabilities ?? 0}
            money={money}
            onAdd={() => openAdd('liability')}
            onEdit={openEdit}
            onBalances={setBalancesFor}
            onDelete={handleDelete}
          />
        </>
      )}

      {modalOpen && (
        <AccountModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          account={editing}
          owners={owners}
          defaultKind={modalKind}
        />
      )}

      {balancesFor && (
        <BalancesModal
          opened={balancesFor !== null}
          onClose={() => setBalancesFor(null)}
          account={balancesFor}
          money={money}
        />
      )}
    </Stack>
  )
}
