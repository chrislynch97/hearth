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
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Expense, ExpenseShare, Member, Pot } from '../../server/db/schema'
import { fromMinor, formatMoney, toMinor } from '../../shared/money'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'

type ExpenseRecurrence = 'monthly' | 'quarterly' | 'yearly'

type ExpenseWithShares = Expense & { shares: ExpenseShare[] }

interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
}

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

function orderMembers(members: Member[]): Member[] {
  const persons = members
    .filter((m) => m.kind === 'person')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const joint = members.filter((m) => m.kind === 'joint')
  return [...persons, ...joint]
}

// ---------------------------------------------------------------------------
// Share row editor (used by both add + edit forms)
// ---------------------------------------------------------------------------

interface ShareRowState {
  ownerId: string
  amountMajor: string
  potId: string | null
}

function buildInitialShareRows(members: Member[], existing: ExpenseShare[] | null): ShareRowState[] {
  return orderMembers(members).map((m) => {
    const share = existing?.find((s) => s.ownerId === m.id)
    return {
      ownerId: m.id,
      amountMajor: '',
      potId: share?.potId ?? null,
    }
  })
}

function ShareRowEditor({
  rows,
  setRows,
  members,
  pots,
  decimalPlaces,
}: {
  rows: ShareRowState[]
  setRows: (rows: ShareRowState[]) => void
  members: Member[]
  pots: Pot[]
  decimalPlaces: number
}) {
  const memberById = new Map(members.map((m) => [m.id, m]))

  function updateRow(ownerId: string, patch: Partial<ShareRowState>) {
    setRows(rows.map((r) => (r.ownerId === ownerId ? { ...r, ...patch } : r)))
  }

  return (
    <Stack gap="xs">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Shares
      </Text>
      {rows.map((row) => {
        const member = memberById.get(row.ownerId)
        const potOptions = [
          { value: '', label: 'No pot' },
          ...pots.map((p) => ({ value: p.id, label: p.name })),
        ]
        return (
          <Group key={row.ownerId} grow align="flex-end" wrap="nowrap">
            <Text size="sm" fw={500} style={{ flex: '0 0 120px' }}>
              {member?.displayName ?? row.ownerId}
            </Text>
            <NumberInput
              size="xs"
              placeholder="0.00"
              decimalScale={decimalPlaces}
              fixedDecimalScale
              min={0}
              value={row.amountMajor}
              onChange={(v) => updateRow(row.ownerId, { amountMajor: v === '' ? '' : String(v) })}
            />
            <Select
              size="xs"
              data={potOptions}
              value={row.potId ?? ''}
              onChange={(v) => updateRow(row.ownerId, { potId: v || null })}
            />
          </Group>
        )
      })}
    </Stack>
  )
}

function sharesToPayload(rows: ShareRowState[], decimalPlaces: number) {
  return rows
    .map((r) => ({
      ownerId: r.ownerId,
      amount: r.amountMajor === '' ? 0 : toMinor(Number(r.amountMajor), decimalPlaces),
      potId: r.potId,
    }))
    .filter((s) => s.amount > 0)
}

// ---------------------------------------------------------------------------
// Add / Edit form modal
// ---------------------------------------------------------------------------

interface ExpenseFormModalProps {
  opened: boolean
  onClose: () => void
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  expense: ExpenseWithShares | null
}

function ExpenseFormModal({ opened, onClose, members, pots, money, expense }: ExpenseFormModalProps) {
  const utils = trpc.useUtils()
  const create = trpc.expenses.create.useMutation()
  const update = trpc.expenses.update.useMutation()

  const [name, setName] = useState(expense?.name ?? '')
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>(
    (expense?.recurrence as ExpenseRecurrence) ?? 'monthly',
  )
  const [note, setNote] = useState(expense?.note ?? '')
  const [dueAnchor, setDueAnchor] = useState(expense?.dueAnchor ?? '')
  const [rows, setRows] = useState<ShareRowState[]>(() => {
    const initial = buildInitialShareRows(members, expense?.shares ?? null)
    if (expense) {
      return initial.map((r) => {
        const share = expense.shares.find((s) => s.ownerId === r.ownerId)
        return {
          ...r,
          amountMajor: share ? String(fromMinor(share.amount, money.decimalPlaces)) : '',
        }
      })
    }
    return initial
  })
  const [error, setError] = useState('')

  const isEditing = expense !== null
  const pending = create.isPending || update.isPending

  function resetAndClose() {
    setError('')
    onClose()
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a name.')
      return
    }
    const shares = sharesToPayload(rows, money.decimalPlaces)
    if (shares.length === 0) {
      setError('At least one share must have an amount greater than zero.')
      return
    }
    setError('')

    const utilsInvalidate = async () => {
      await Promise.all([utils.expenses.list.invalidate(), utils.plan.funding.invalidate()])
    }

    if (isEditing) {
      await update.mutateAsync({
        id: expense.id,
        name: trimmed,
        recurrence,
        note: note.trim(),
        dueAnchor: dueAnchor || undefined,
        shares,
      })
    } else {
      await create.mutateAsync({
        name: trimmed,
        recurrence,
        note: note.trim() || undefined,
        dueAnchor: dueAnchor || undefined,
        shares,
      })
    }
    await utilsInvalidate()
    resetAndClose()
  }

  return (
    <Modal opened={opened} onClose={resetAndClose} title={isEditing ? 'Edit outgoing' : 'Add outgoing'} size="lg">
      <Stack gap="sm">
        <TextInput
          label="Name"
          placeholder="e.g. Council tax"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          autoFocus
        />
        <Group grow>
          <Select
            label="Recurrence"
            data={RECURRENCE_OPTIONS}
            value={recurrence}
            onChange={(v) => setRecurrence((v as ExpenseRecurrence) ?? 'monthly')}
            allowDeselect={false}
          />
          <TextInput
            label="Due date (optional)"
            placeholder="YYYY-MM-DD"
            type="date"
            value={dueAnchor}
            onChange={(e) => setDueAnchor(e.currentTarget.value)}
          />
        </Group>
        <TextInput
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Divider />
        <ShareRowEditor
          rows={rows}
          setRows={setRows}
          members={members}
          pots={pots}
          decimalPlaces={money.decimalPlaces}
        />
        {(error || create.error || update.error) && (
          <Alert color="red" title="Error">
            {error || create.error?.message || update.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={pending}>
            {isEditing ? 'Save' : 'Add outgoing'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Expense row
// ---------------------------------------------------------------------------

function ExpenseRow({
  expense,
  members,
  pots,
  money,
  onEdit,
}: {
  expense: ExpenseWithShares
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  onEdit: () => void
}) {
  const utils = trpc.useUtils()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const archive = trpc.expenses.archive.useMutation()

  const memberById = new Map(members.map((m) => [m.id, m]))
  const potById = new Map(pots.map((p) => [p.id, p]))

  const monthlyTotal = roundMinor(
    expense.shares.reduce(
      (acc, s) => acc + normaliseToMonthly(s.amount, expense.recurrence as Recurrence),
      0,
    ),
  )

  async function handleArchive() {
    await archive.mutateAsync({ id: expense.id })
    await Promise.all([utils.expenses.list.invalidate(), utils.plan.funding.invalidate()])
    setConfirmArchive(false)
  }

  return (
    <>
      <Card withBorder padding="sm">
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="wrap">
              <Text fw={600}>{expense.name}</Text>
              <Badge size="sm" variant="light">
                {expense.recurrence}
              </Badge>
              <Text size="sm" c="dimmed">
                {formatMoney(monthlyTotal, money)}/mo
              </Text>
            </Group>
            <Group gap={4}>
              <ActionIcon variant="subtle" size="sm" aria-label={`Edit ${expense.name}`} onClick={onEdit}>
                ✎
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label={`Archive ${expense.name}`}
                onClick={() => setConfirmArchive(true)}
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
          <Stack gap={2}>
            {expense.shares.map((s) => {
              const owner = memberById.get(s.ownerId)
              const potName = s.potId ? potById.get(s.potId)?.name : null
              return (
                <Group key={s.id} gap={6} wrap="wrap">
                  <Text size="sm">{owner?.displayName ?? s.ownerId}</Text>
                  <Text size="sm" c="dimmed">
                    {formatMoney(s.amount, money)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {potName ? `→ ${potName}` : '→ no pot'}
                  </Text>
                </Group>
              )
            })}
          </Stack>
          {expense.note && (
            <Text size="xs" c="dimmed">
              {expense.note}
            </Text>
          )}
        </Stack>
      </Card>
      <Modal opened={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive outgoing?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{expense.name}</strong>? This can't be undone from here.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleArchive()} loading={archive.isPending}>
              Archive
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// OutgoingsPage
// ---------------------------------------------------------------------------

export function OutgoingsPage() {
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const expensesQuery = trpc.expenses.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()

  const [formOpened, setFormOpened] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithShares | null>(null)

  const household = ctxQuery.data?.household
  const money: MoneyFormat = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const expenses = (expensesQuery.data ?? []).filter((e) => e.active === 1)
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)

  const isLoading = expensesQuery.isLoading || potsQuery.isLoading || membersQuery.isLoading

  function openAdd() {
    setEditingExpense(null)
    setFormOpened(true)
  }

  function openEdit(expense: ExpenseWithShares) {
    setEditingExpense(expense)
    setFormOpened(true)
  }

  return (
    <Stack gap="lg" maw={900} mx="auto" mt="xl">
      <Group justify="space-between">
        <Title order={2}>Outgoings</Title>
        <Button onClick={openAdd}>Add outgoing</Button>
      </Group>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && expenses.length === 0 && (
        <Text c="dimmed">No outgoings yet — add one to start building your funding plan.</Text>
      )}

      <Stack gap="sm">
        {expenses.map((e) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            members={members}
            pots={pots}
            money={money}
            onEdit={() => openEdit(e)}
          />
        ))}
      </Stack>

      {formOpened && (
        <ExpenseFormModal
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          members={members}
          pots={pots}
          money={money}
          expense={editingExpense}
        />
      )}
    </Stack>
  )
}
