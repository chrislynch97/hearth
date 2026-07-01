import { useEffect, useMemo, useState } from 'react'
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
  Modal,
  NumberInput,
  Select,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Member, Pot, SpendTransaction } from '../../server/db/schema'
import { formatMoney, toMinor } from '../../shared/money'

interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
}

function orderMembers(members: Member[]): Member[] {
  const persons = members
    .filter((m) => m.kind === 'person')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const joint = members.filter((m) => m.kind === 'joint')
  return [...persons, ...joint]
}

function potOptions(pots: Pot[]) {
  return [
    { value: '', label: 'No pot (assign later)' },
    ...pots.map((p) => ({ value: p.id, label: p.name })),
  ]
}

// ---------------------------------------------------------------------------
// Quick-add form
// ---------------------------------------------------------------------------

function QuickAddForm({
  members,
  pots,
  money,
}: {
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
}) {
  const utils = trpc.useUtils()
  const add = trpc.spends.add.useMutation()

  const orderedMembers = orderMembers(members)
  const [amountMajor, setAmountMajor] = useState<string>('')
  const [kind, setKind] = useState<'spend' | 'refund'>('spend')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(orderedMembers[0]?.id ?? null)
  const [potId, setPotId] = useState<string | null>(null)
  const [potManuallyChosen, setPotManuallyChosen] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const suggestQuery = trpc.spends.suggestPot.useQuery(
    { description: description.trim(), ownerId: ownerId ?? '' },
    { enabled: description.trim().length > 0 && !!ownerId },
  )

  useEffect(() => {
    if (potManuallyChosen) return
    const suggested = suggestQuery.data?.potId
    if (suggested) setPotId(suggested)
  }, [suggestQuery.data, potManuallyChosen])

  const potById = new Map(pots.map((p) => [p.id, p]))

  function resetForm(keepOwner: string | null) {
    setAmountMajor('')
    setKind('spend')
    setDescription('')
    setPotId(null)
    setPotManuallyChosen(false)
    setError('')
    setOwnerId(keepOwner)
  }

  async function handleSubmit() {
    const trimmedDescription = description.trim()
    if (!trimmedDescription) {
      setError('Please enter a description.')
      return
    }
    if (!ownerId) {
      setError('Please choose who this is for.')
      return
    }
    const majorValue = Number(amountMajor)
    if (amountMajor === '' || Number.isNaN(majorValue) || majorValue <= 0) {
      setError('Please enter an amount greater than zero.')
      return
    }
    setError('')
    setSuccessMessage('')

    const minor = toMinor(majorValue, money.decimalPlaces)
    const amount = kind === 'refund' ? -minor : minor

    const inserted = await add.mutateAsync({
      description: trimmedDescription,
      amount,
      ownerId,
      potId: potId || null,
    })

    await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])

    const potName = inserted.potId ? potById.get(inserted.potId)?.name : null
    setSuccessMessage(
      `Logged ${formatMoney(Math.abs(inserted.amount), money)}${
        potName ? ` — take from ${potName}` : ' — needs a pot'
      }`,
    )

    resetForm(ownerId)
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>Quick add</Title>
        <Group grow align="flex-end" wrap="wrap">
          <NumberInput
            label="Amount"
            placeholder="0.00"
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            value={amountMajor}
            onChange={(v) => setAmountMajor(v === '' ? '' : String(v))}
            leftSection={<Text size="sm">{money.symbol}</Text>}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Type
            </Text>
            <SegmentedControl
              fullWidth
              value={kind}
              onChange={(v) => setKind(v as 'spend' | 'refund')}
              data={[
                { value: 'spend', label: 'Spend' },
                { value: 'refund', label: 'Refund' },
              ]}
            />
          </div>
        </Group>
        <TextInput
          label="Description"
          placeholder="e.g. Tesco"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autoFocus
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Who's this for?
          </Text>
          <SegmentedControl
            fullWidth
            value={ownerId ?? ''}
            onChange={(v) => setOwnerId(v || null)}
            data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </div>
        <Select
          label="Pot"
          data={potOptions(pots)}
          value={potId ?? ''}
          onChange={(v) => {
            setPotId(v || null)
            setPotManuallyChosen(true)
          }}
        />
        {(error || add.error) && (
          <Alert color="red" title="Error">
            {error || add.error?.message}
          </Alert>
        )}
        {successMessage && !error && (
          <Alert color="green" title="Logged">
            {successMessage}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button onClick={() => void handleSubmit()} loading={add.isPending}>
            Add {kind === 'refund' ? 'refund' : 'spend'}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Register row (inline pot assign + delete)
// ---------------------------------------------------------------------------

function AssignPotCell({ spend, pots }: { spend: SpendTransaction; pots: Pot[] }) {
  const utils = trpc.useUtils()
  const update = trpc.spends.update.useMutation()
  const [value, setValue] = useState<string>('')

  async function handleSave(v: string | null) {
    setValue(v ?? '')
    if (!v) return
    await update.mutateAsync({ id: spend.id, potId: v })
    await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])
  }

  return (
    <Select
      size="xs"
      placeholder="Assign a pot"
      data={pots.map((p) => ({ value: p.id, label: p.name }))}
      value={value || null}
      onChange={(v) => void handleSave(v)}
      disabled={update.isPending}
      w={180}
    />
  )
}

function SpendRow({
  spend,
  members,
  pots,
  money,
}: {
  spend: SpendTransaction
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
}) {
  const utils = trpc.useUtils()
  const remove = trpc.spends.remove.useMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const owner = members.find((m) => m.id === spend.ownerId)
  const pot = spend.potId ? pots.find((p) => p.id === spend.potId) : null
  const isRefund = spend.amount < 0

  async function handleDelete() {
    await remove.mutateAsync({ id: spend.id })
    await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])
    setConfirmDelete(false)
  }

  return (
    <>
      <Table.Tr>
        <Table.Td>{spend.date}</Table.Td>
        <Table.Td>{spend.description}</Table.Td>
        <Table.Td>{owner?.displayName ?? spend.ownerId}</Table.Td>
        <Table.Td>
          <Text c={isRefund ? 'teal' : undefined} fw={isRefund ? 600 : undefined}>
            {isRefund ? '+' : ''}
            {formatMoney(Math.abs(spend.amount), money)}
          </Text>
        </Table.Td>
        <Table.Td>
          {pot ? (
            <Text size="sm">{pot.name}</Text>
          ) : (
            <Group gap="xs" wrap="nowrap">
              <Badge size="sm" color="yellow" variant="light">
                Needs a pot
              </Badge>
              <AssignPotCell spend={spend} pots={pots} />
            </Group>
          )}
        </Table.Td>
        <Table.Td>
          {spend.reconciled === 1 ? (
            <Badge size="sm" color="green" variant="light">
              Reconciled
            </Badge>
          ) : (
            <Badge size="sm" color="gray" variant="light">
              Pending
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Delete ${spend.description}`}
            onClick={() => setConfirmDelete(true)}
          >
            ×
          </ActionIcon>
        </Table.Td>
      </Table.Tr>
      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete transaction?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            Delete <strong>{spend.description}</strong>? This can't be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleDelete()} loading={remove.isPending}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Register (list + filters)
// ---------------------------------------------------------------------------

function Register({ members, pots, money }: { members: Member[]; pots: Pot[]; money: MoneyFormat }) {
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)
  const [potFilter, setPotFilter] = useState<string | null>(null)
  const [reconciledFilter, setReconciledFilter] = useState<string | null>(null)
  const [needsPotOnly, setNeedsPotOnly] = useState(false)

  const input = useMemo(() => {
    const i: { ownerId?: string; potId?: string; reconciled?: boolean; needsPot?: boolean } = {}
    if (ownerFilter) i.ownerId = ownerFilter
    if (potFilter) i.potId = potFilter
    if (reconciledFilter) i.reconciled = reconciledFilter === 'yes'
    if (needsPotOnly) i.needsPot = true
    return i
  }, [ownerFilter, potFilter, reconciledFilter, needsPotOnly])

  const spendsQuery = trpc.spends.list.useQuery(input)
  const spends = spendsQuery.data ?? []

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>Register</Title>
        <Group gap="sm" wrap="wrap" align="flex-end">
          <Select
            label="Owner"
            placeholder="All"
            data={members.map((m) => ({ value: m.id, label: m.displayName }))}
            value={ownerFilter}
            onChange={setOwnerFilter}
            clearable
            size="xs"
          />
          <Select
            label="Pot"
            placeholder="All"
            data={pots.map((p) => ({ value: p.id, label: p.name }))}
            value={potFilter}
            onChange={setPotFilter}
            clearable
            size="xs"
          />
          <Select
            label="Reconciled"
            placeholder="All"
            data={[
              { value: 'yes', label: 'Reconciled' },
              { value: 'no', label: 'Pending' },
            ]}
            value={reconciledFilter}
            onChange={setReconciledFilter}
            clearable
            size="xs"
          />
          <Switch
            label="Needs a pot"
            checked={needsPotOnly}
            onChange={(e) => setNeedsPotOnly(e.currentTarget.checked)}
            mb={4}
          />
        </Group>

        {spendsQuery.isLoading && (
          <Center>
            <Loader size="sm" />
          </Center>
        )}

        {!spendsQuery.isLoading && spends.length === 0 && (
          <Text c="dimmed" size="sm">
            No spending transactions match these filters.
          </Text>
        )}

        {!spendsQuery.isLoading && spends.length > 0 && (
          <Table.ScrollContainer minWidth={700}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Pot</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {spends.map((s) => (
                  <SpendRow key={s.id} spend={s} members={members} pots={pots} money={money} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SpendingPage
// ---------------------------------------------------------------------------

export function SpendingPage() {
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const membersQuery = trpc.members.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()

  const household = ctxQuery.data?.household
  const money: MoneyFormat = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const pots = potsQuery.data ?? []

  const isLoading = membersQuery.isLoading || potsQuery.isLoading

  return (
    <Stack gap="lg" maw={900} mx="auto" mt="xl">
      <Title order={2}>Spending</Title>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && (
        <>
          <QuickAddForm members={members} pots={pots} money={money} />
          <Divider />
          <Register members={members} pots={pots} money={money} />
        </>
      )}
    </Stack>
  )
}
