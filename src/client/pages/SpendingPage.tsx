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
import { DatePickerInput } from '@mantine/dates'
import { trpc } from '../trpc'
import type { Member, Pot, SpendTransaction } from '../../server/db/schema'
import { allocate, formatMoney, fromMinor, toMinor } from '../../shared/money'
import { todayIso } from '../../shared/dates'
import { useFormatDate } from '../useMoney'

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
  return pots.map((p) => ({ value: p.id, label: p.name }))
}

// ---------------------------------------------------------------------------
// Add-spend form
// ---------------------------------------------------------------------------

/** Format a due date relative to today for the outgoings picker. */
function dueLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'due today'
  if (daysUntil > 0) return `due in ${daysUntil}d`
  return `due ${-daysUntil}d ago`
}

function AddSpendForm({
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
  const updateExpense = trpc.expenses.update.useMutation()
  const outgoingsQuery = trpc.plan.recentlyDue.useQuery()

  const orderedMembers = orderMembers(members)
  const [amountMajor, setAmountMajor] = useState<string>('')
  const [kind, setKind] = useState<'spend' | 'refund'>('spend')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState<string | null>(todayIso())
  const [ownerId, setOwnerId] = useState<string | null>(orderedMembers[0]?.id ?? null)
  const [potId, setPotId] = useState<string | null>(null)
  const [potManuallyChosen, setPotManuallyChosen] = useState(false)
  // The outgoing this entry was prefilled from (drives the "update it going
  // forward?" prompt), and a hint when that outgoing is split across people.
  const [outgoingKey, setOutgoingKey] = useState<string | null>(null)
  const [multiShareHint, setMultiShareHint] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [pendingUpdate, setPendingUpdate] = useState<null | {
    expenseId: string
    name: string
    from: number
    to: number
    share: { ownerId: string; amount: number; potId: string | null }
  }>(null)

  const outgoings = outgoingsQuery.data ?? []
  const selectedOutgoing = outgoings.find((o) => o.key === outgoingKey) ?? null

  // A pot belongs to exactly one member, so the pot field must only ever offer
  // — and hold — pots the currently selected owner owns.
  const ownerPots = useMemo(() => pots.filter((p) => p.ownerId === ownerId), [pots, ownerId])

  const suggestQuery = trpc.spends.suggestPot.useQuery(
    { description: description.trim(), ownerId: ownerId ?? '' },
    { enabled: description.trim().length > 0 && !!ownerId },
  )

  useEffect(() => {
    if (potManuallyChosen) return
    const suggested = suggestQuery.data?.potId
    // Only apply a suggestion the selected owner can actually use. This rejects
    // both cross-owner matches and the stale suggestion React Query returns for
    // a just-changed owner — in either case we show no pot rather than a hidden,
    // invalid value.
    const valid = suggested != null && ownerPots.some((p) => p.id === suggested)
    setPotId(valid ? suggested : null)
  }, [suggestQuery.data, potManuallyChosen, ownerPots])

  const potById = new Map(pots.map((p) => [p.id, p]))

  function resetForm(keepOwner: string | null) {
    setAmountMajor('')
    setKind('spend')
    setDescription('')
    setDate(todayIso())
    setPotId(null)
    setPotManuallyChosen(false)
    setOutgoingKey(null)
    setMultiShareHint(false)
    setError('')
    setOwnerId(keepOwner)
  }

  // Prefill the form from a recently-due outgoing. A single-share outgoing maps
  // straight onto one spend; a split one prefills the total on the primary
  // owner and nudges the user toward Split.
  function selectOutgoing(key: string | null) {
    setOutgoingKey(key)
    setMultiShareHint(false)
    setError('')
    setSuccessMessage('')
    if (!key) return
    const o = outgoings.find((x) => x.key === key)
    if (!o) return
    setDescription(o.name)
    setDate(o.date)
    setKind('spend')
    if (o.shares.length === 1) {
      const s = o.shares[0]!
      setOwnerId(s.ownerId)
      setPotId(s.potId)
      setAmountMajor(String(fromMinor(s.amount, money.decimalPlaces)))
    } else {
      const jointShare = o.shares.find((s) => members.find((m) => m.id === s.ownerId)?.kind === 'joint')
      const primary = jointShare ?? o.shares[0]
      setOwnerId(primary?.ownerId ?? ownerId)
      setPotId(null)
      setAmountMajor(String(fromMinor(o.totalAmount, money.decimalPlaces)))
      setMultiShareHint(true)
    }
    // Picking an outgoing is an explicit pot choice; don't let the description
    // suggestion overwrite it.
    setPotManuallyChosen(true)
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
      date: date ?? undefined,
      description: trimmedDescription,
      amount,
      ownerId,
      potId: potId || null,
    })

    await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])

    // If this was logged from a single-share outgoing and what we recorded
    // differs from its expected share, offer to update the outgoing going
    // forward. (Refunds never redefine an expected cost.)
    let nextUpdate: typeof pendingUpdate = null
    if (kind === 'spend' && selectedOutgoing && selectedOutgoing.shares.length === 1) {
      const ref = selectedOutgoing.shares[0]!
      const changed =
        minor !== ref.amount || ownerId !== ref.ownerId || (potId || null) !== (ref.potId ?? null)
      if (changed) {
        nextUpdate = {
          expenseId: selectedOutgoing.expenseId,
          name: selectedOutgoing.name,
          from: ref.amount,
          to: minor,
          share: { ownerId, amount: minor, potId: potId || null },
        }
      }
    }
    setPendingUpdate(nextUpdate)

    const potName = inserted.potId ? potById.get(inserted.potId)?.name : null
    setSuccessMessage(
      `Logged ${formatMoney(Math.abs(inserted.amount), money)}${
        potName ? ` — take from ${potName}` : ' — needs a pot'
      }`,
    )

    resetForm(ownerId)
  }

  async function applyOutgoingUpdate() {
    if (!pendingUpdate) return
    await updateExpense.mutateAsync({
      id: pendingUpdate.expenseId,
      shares: [pendingUpdate.share],
    })
    await Promise.all([
      utils.plan.recentlyDue.invalidate(),
      utils.plan.upcoming.invalidate(),
      utils.plan.funding.invalidate(),
      utils.expenses.list.invalidate(),
    ])
    setPendingUpdate(null)
    setSuccessMessage(`Updated ${pendingUpdate.name} going forward.`)
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>Add spending</Title>
        {outgoings.length > 0 && (
          <Select
            label="Log a regular outgoing"
            placeholder="Search recent bills to prefill…"
            data={outgoings.map((o) => ({
              value: o.key,
              label: `${o.name} · ${formatMoney(o.totalAmount, money)} · ${dueLabel(o.daysUntil)}`,
            }))}
            value={outgoingKey}
            searchable
            clearable
            onChange={selectOutgoing}
          />
        )}
        {multiShareHint && (
          <Alert color="sand" title="Split outgoing">
            This outgoing is shared across people. The total is filled in — add it, then use{' '}
            <strong>Split</strong> on its row to divide it between pots.
          </Alert>
        )}
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
          <DatePickerInput
            label="Date"
            value={date}
            onChange={setDate}
            valueFormat="DD MMM YYYY"
            maxDate={todayIso()}
            popoverProps={{ withinPortal: true }}
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
            onChange={(v) => {
              setOwnerId(v || null)
              // Pots belong to a single owner, so a pot picked for one person
              // is meaningless for another — clear it and let the suggestion
              // re-run for the newly selected owner.
              setPotId(null)
              setPotManuallyChosen(false)
            }}
            data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </div>
        <Select
          label="Pot"
          placeholder="No pot (assign later)"
          data={potOptions(ownerPots)}
          value={potId}
          searchable
          clearable
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
          <Alert color="moss" title="Logged">
            {successMessage}
          </Alert>
        )}
        {pendingUpdate && (
          <Alert color="apricot" title="Update this outgoing?">
            <Stack gap="xs">
              <Text size="sm">
                You logged a different amount than {pendingUpdate.name}'s expected{' '}
                {formatMoney(pendingUpdate.from, money)}. Update it to{' '}
                {formatMoney(pendingUpdate.to, money)} going forward?
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  onClick={() => void applyOutgoingUpdate()}
                  loading={updateExpense.isPending}
                >
                  Update {pendingUpdate.name}
                </Button>
                <Button size="xs" variant="default" onClick={() => setPendingUpdate(null)}>
                  Keep as is
                </Button>
              </Group>
            </Stack>
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
// Split modal — divide one spend into rows that sum to the original
// ---------------------------------------------------------------------------

interface SplitPart {
  amountMajor: number | string
  ownerId: string
  potId: string | null
}

function SplitModal({
  spend,
  members,
  pots,
  money,
  opened,
  onClose,
}: {
  spend: SpendTransaction
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  opened: boolean
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const split = trpc.spends.split.useMutation()
  const orderedMembers = orderMembers(members)
  const sign = spend.amount < 0 ? -1 : 1
  const totalMinor = Math.abs(spend.amount)

  // Default: an even two-way split so the remainder starts at zero.
  const even = allocate(totalMinor, [1, 1])
  const [parts, setParts] = useState<SplitPart[]>([
    { amountMajor: fromMinor(even[0]!, money.decimalPlaces), ownerId: spend.ownerId, potId: spend.potId },
    { amountMajor: fromMinor(even[1]!, money.decimalPlaces), ownerId: spend.ownerId, potId: spend.potId },
  ])
  const [error, setError] = useState('')

  function update(i: number, patch: Partial<SplitPart>) {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function addRow() {
    setParts((prev) => [...prev, { amountMajor: '', ownerId: spend.ownerId, potId: null }])
  }
  function removeRow(i: number) {
    setParts((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))
  }
  function splitEvenly() {
    const amounts = allocate(totalMinor, parts.map(() => 1))
    setParts((prev) => prev.map((p, i) => ({ ...p, amountMajor: fromMinor(amounts[i]!, money.decimalPlaces) })))
  }

  const partMinors = parts.map((p) =>
    p.amountMajor === '' ? 0 : toMinor(Number(p.amountMajor), money.decimalPlaces),
  )
  const sumMinor = partMinors.reduce((a, b) => a + b, 0)
  const remainderMinor = totalMinor - sumMinor
  const allValid = parts.every((p, i) => p.ownerId && partMinors[i]! > 0)
  const canSave = remainderMinor === 0 && allValid && !split.isPending

  async function handleSave() {
    if (!canSave) return
    setError('')
    try {
      await split.mutateAsync({
        id: spend.id,
        parts: parts.map((p, i) => ({
          amount: sign * partMinors[i]!,
          ownerId: p.ownerId,
          potId: p.potId,
        })),
      })
      await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not split this spend.')
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Split "${spend.description}"`} size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Divide {formatMoney(totalMinor, money)} across pots and people. The parts must add up to the total.
        </Text>
        {parts.map((p, i) => (
          <Group key={i} align="flex-end" gap="xs" wrap="nowrap">
            <NumberInput
              label={i === 0 ? 'Amount' : undefined}
              placeholder="0.00"
              decimalScale={money.decimalPlaces}
              fixedDecimalScale
              min={0}
              w={120}
              leftSection={<Text size="sm">{money.symbol}</Text>}
              value={p.amountMajor}
              onChange={(v) => update(i, { amountMajor: v })}
            />
            <Select
              label={i === 0 ? 'Who' : undefined}
              data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
              value={p.ownerId}
              onChange={(v) => update(i, { ownerId: v ?? p.ownerId, potId: null })}
              allowDeselect={false}
              w={130}
            />
            <Select
              label={i === 0 ? 'Pot' : undefined}
              placeholder="No pot (assign later)"
              data={potOptions(pots.filter((pt) => pt.ownerId === p.ownerId))}
              value={p.potId}
              searchable
              clearable
              onChange={(v) => update(i, { potId: v || null })}
              style={{ flex: 1 }}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              size="lg"
              aria-label="Remove row"
              disabled={parts.length <= 2}
              onClick={() => removeRow(i)}
            >
              ×
            </ActionIcon>
          </Group>
        ))}

        <Group justify="space-between">
          <Group gap="xs">
            <Button size="xs" variant="default" onClick={addRow}>
              + Add row
            </Button>
            <Button size="xs" variant="default" onClick={splitEvenly}>
              Split evenly
            </Button>
          </Group>
          <Text size="sm" c={remainderMinor === 0 ? 'moss' : 'red'} fw={600}>
            {remainderMinor === 0 ? 'Balanced ✓' : `Remaining ${formatMoney(remainderMinor, money)}`}
          </Text>
        </Group>

        {(error || split.error) && (
          <Alert color="red" title="Error">
            {error || split.error?.message}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave} loading={split.isPending}>
            Save split
          </Button>
        </Group>
      </Stack>
    </Modal>
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
      searchable
      onChange={(v) => void handleSave(v)}
      disabled={update.isPending}
      w={180}
    />
  )
}

// ---------------------------------------------------------------------------
// Edit modal — change a pending spend's details before it's reconciled
// ---------------------------------------------------------------------------

function EditSpendModal({
  spend,
  members,
  pots,
  money,
  opened,
  onClose,
}: {
  spend: SpendTransaction
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  opened: boolean
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const update = trpc.spends.update.useMutation()
  const orderedMembers = orderMembers(members)

  const [amountMajor, setAmountMajor] = useState<string>(
    String(fromMinor(Math.abs(spend.amount), money.decimalPlaces)),
  )
  const [kind, setKind] = useState<'spend' | 'refund'>(spend.amount < 0 ? 'refund' : 'spend')
  const [description, setDescription] = useState(spend.description)
  const [date, setDate] = useState<string | null>(spend.date)
  const [ownerId, setOwnerId] = useState<string | null>(spend.ownerId)
  const [potId, setPotId] = useState<string | null>(spend.potId)
  const [error, setError] = useState('')

  const ownerPots = useMemo(() => pots.filter((p) => p.ownerId === ownerId), [pots, ownerId])

  async function handleSave() {
    const trimmed = description.trim()
    if (!trimmed) {
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

    const minor = toMinor(majorValue, money.decimalPlaces)
    try {
      await update.mutateAsync({
        id: spend.id,
        date: date ?? undefined,
        description: trimmed,
        amount: kind === 'refund' ? -minor : minor,
        ownerId,
        potId: potId || null,
      })
      await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.')
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Edit spend" size="md">
      <Stack gap="sm">
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
          <DatePickerInput
            label="Date"
            value={date}
            onChange={setDate}
            valueFormat="DD MMM YYYY"
            maxDate={todayIso()}
            popoverProps={{ withinPortal: true }}
          />
        </Group>
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
        <TextInput
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Who's this for?
          </Text>
          <SegmentedControl
            fullWidth
            value={ownerId ?? ''}
            onChange={(v) => {
              setOwnerId(v || null)
              // A pot belongs to one owner; clear it when the owner changes.
              setPotId(null)
            }}
            data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </div>
        <Select
          label="Pot"
          placeholder="No pot (assign later)"
          data={potOptions(ownerPots)}
          value={potId}
          searchable
          clearable
          onChange={(v) => setPotId(v || null)}
        />
        {(error || update.error) && (
          <Alert color="red" title="Error">
            {error || update.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={update.isPending}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </Modal>
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
  const fmt = useFormatDate()
  const remove = trpc.spends.remove.useMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

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
        <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmt(spend.date)}</Table.Td>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            {spend.description}
            {spend.splitGroupId && (
              <Badge size="xs" variant="light" color="gray">
                split
              </Badge>
            )}
          </Group>
        </Table.Td>
        <Table.Td>{owner?.displayName ?? spend.ownerId}</Table.Td>
        <Table.Td>
          <Text c={isRefund ? 'moss' : undefined} fw={isRefund ? 600 : undefined}>
            {isRefund ? '+' : ''}
            {formatMoney(Math.abs(spend.amount), money)}
          </Text>
        </Table.Td>
        <Table.Td>
          {pot ? (
            <Text size="sm">{pot.name}</Text>
          ) : (
            <Group gap="xs" wrap="nowrap">
              <Badge size="sm" color="apricot" variant="light">
                Needs a pot
              </Badge>
              <AssignPotCell spend={spend} pots={pots} />
            </Group>
          )}
        </Table.Td>
        <Table.Td>
          {spend.reconciled === 1 ? (
            <Badge size="sm" color="moss" variant="light">
              Reconciled
            </Badge>
          ) : (
            <Badge size="sm" color="sand" variant="light">
              Pending
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <Group gap={4} justify="flex-end" wrap="nowrap">
            {spend.reconciled === 0 && (
              <Button
                size="compact-xs"
                variant="subtle"
                aria-label={`Edit ${spend.description}`}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
            {spend.reconciled === 0 && (
              <Button
                size="compact-xs"
                variant="subtle"
                aria-label={`Split ${spend.description}`}
                onClick={() => setSplitOpen(true)}
              >
                Split
              </Button>
            )}
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              aria-label={`Delete ${spend.description}`}
              onClick={() => setConfirmDelete(true)}
            >
              ×
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
      {editOpen && (
        <EditSpendModal
          spend={spend}
          members={members}
          pots={pots}
          money={money}
          opened={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
      {splitOpen && (
        <SplitModal
          spend={spend}
          members={members}
          pots={pots}
          money={money}
          opened={splitOpen}
          onClose={() => setSplitOpen(false)}
        />
      )}
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
            searchable
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
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Date</Table.Th>
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
    <Stack gap="lg" maw={900} mx="auto">
      <Title order={2}>Spending</Title>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && (
        <>
          <AddSpendForm members={members} pots={pots} money={money} />
          <Divider />
          <Register members={members} pots={pots} money={money} />
        </>
      )}
    </Stack>
  )
}
