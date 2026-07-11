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
import type { Category, Member, Pot, SpendTransaction } from '../../server/db/schema'
import { allocate, formatMoney, fromMinor, toMinor } from '../../shared/money'
import { todayIso } from '../../shared/dates'
import { useMoney, useFormatDate, type MoneyFormat } from '../useMoney'
import { groupedPotOptions, orderMembers } from '../potOptions'

// ---------------------------------------------------------------------------
// Add-spend form
// ---------------------------------------------------------------------------

/** Format a due date relative to today for the outgoings picker. */
function dueLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'due today'
  if (daysUntil > 0) return `due in ${daysUntil}d`
  return `due ${-daysUntil}d ago`
}

/** The pot / category / settlement of a spend, as one value. */
export interface SpendFunding {
  potId: string | null
  categoryId: string | null
  settledAtSource: boolean
}

/**
 * The "where did this come from?" control, shared by the add form and the edit
 * modal so they can never drift. Two mutually-exclusive sources:
 *   - A pot: pick one (or leave empty = "needs a pot", shows on Catch-up); the
 *     "already came out" toggle marks an auto-deducting pot (settled, no catch-up).
 *   - Main account: pick a category; always settled, never on Catch-up.
 * This makes "needs a pot" vs "main account" an explicit choice rather than an
 * ambiguous combination of a blank pot + a toggle.
 */
function SpendFundingFields({
  value,
  onChange,
  pots,
  members,
  categories,
}: {
  value: SpendFunding
  onChange: (next: SpendFunding) => void
  pots: Pot[]
  members: Member[]
  categories: Category[]
}) {
  const { potId, categoryId, settledAtSource } = value
  // Main account = no pot but settled at source; everything else is "a pot"
  // (including an empty pot, i.e. needs-a-pot).
  const source: 'pot' | 'main' = potId == null && settledAtSource ? 'main' : 'pot'
  const potGroups = groupedPotOptions(pots, members)

  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={500} mb={4}>
          Comes from
        </Text>
        <SegmentedControl
          fullWidth
          value={source}
          onChange={(v) =>
            v === 'main'
              ? onChange({ potId: null, categoryId, settledAtSource: true })
              : onChange({ potId: null, categoryId: null, settledAtSource: false })
          }
          data={[
            { value: 'pot', label: 'A pot' },
            { value: 'main', label: 'Main account' },
          ]}
        />
      </div>

      {source === 'pot' ? (
        <>
          <Select
            label="Pot"
            placeholder="No pot (assign later)"
            description="Leave empty to sort the pot out later — it'll show on Catch-up as needing a pot."
            data={potGroups}
            value={potId}
            searchable
            clearable
            onChange={(v) => onChange({ potId: v || null, categoryId: null, settledAtSource: v ? settledAtSource : false })}
          />
          {potId && (
            <Switch
              label="Already came out — no transfer needed"
              description="Tick for a pot that auto-deducts (e.g. Monzo). Keeps it off Catch-up."
              checked={settledAtSource}
              onChange={(e) => onChange({ potId, categoryId: null, settledAtSource: e.currentTarget.checked })}
            />
          )}
        </>
      ) : (
        <Select
          label="Category"
          placeholder="Pick a category"
          description="Paid straight from the main account — won't show on Catch-up."
          data={categories.map((c) => ({ value: c.id, label: c.name }))}
          value={categoryId}
          searchable
          onChange={(v) => onChange({ potId: null, categoryId: v, settledAtSource: true })}
        />
      )}
    </Stack>
  )
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
  const categories = trpc.categories.list.useQuery().data ?? []

  const orderedMembers = orderMembers(members)
  const [amountMajor, setAmountMajor] = useState<string>('')
  const [kind, setKind] = useState<'spend' | 'refund'>('spend')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState<string | null>(todayIso())
  // Owner = who *paid* (the person to repay). The pot it draws from is chosen
  // independently now, so we never filter pots by owner.
  const [ownerId, setOwnerId] = useState<string | null>(orderedMembers[0]?.id ?? null)
  const [potId, setPotId] = useState<string | null>(null)
  const [potManuallyChosen, setPotManuallyChosen] = useState(false)
  // "Already came out / no transfer needed" — auto-pot deduction or main account.
  const [settledAtSource, setSettledAtSource] = useState(false)
  // Category carried from a main-account bill prefill (recorded when there's no pot).
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // The bill this entry was prefilled from (drives the "update it going forward?" prompt).
  const [outgoingKey, setOutgoingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [pendingUpdate, setPendingUpdate] = useState<null | {
    expenseId: string
    name: string
    from: number
    to: number
    amount: number
  }>(null)

  const outgoings = outgoingsQuery.data ?? []
  const selectedOutgoing = outgoings.find((o) => o.key === outgoingKey) ?? null

  const suggestQuery = trpc.spends.suggestPot.useQuery(
    { description: description.trim(), ownerId: ownerId ?? '' },
    { enabled: description.trim().length > 0 && !!ownerId },
  )

  useEffect(() => {
    if (potManuallyChosen) return
    const suggested = suggestQuery.data?.potId
    const valid = suggested != null && pots.some((p) => p.id === suggested)
    setPotId(valid ? suggested : null)
  }, [suggestQuery.data, potManuallyChosen, pots])

  const potById = new Map(pots.map((p) => [p.id, p]))

  function resetForm(keepOwner: string | null) {
    setAmountMajor('')
    setKind('spend')
    setDescription('')
    setDate(todayIso())
    setPotId(null)
    setPotManuallyChosen(false)
    setSettledAtSource(false)
    setCategoryId(null)
    setOutgoingKey(null)
    setError('')
    setOwnerId(keepOwner)
  }

  // Prefill the form from a recently-due bill. A bill is single-pot now, so it
  // maps straight onto one spend; its funding decides whether the spend is
  // settled at source (auto-pot / main account → no catch-up).
  function selectOutgoing(key: string | null) {
    setOutgoingKey(key)
    setError('')
    setSuccessMessage('')
    if (!key) {
      setSettledAtSource(false)
      setCategoryId(null)
      return
    }
    const o = outgoings.find((x) => x.key === key)
    if (!o) return
    setDescription(o.name)
    setDate(o.date)
    setKind('spend')
    setPotId(o.potId)
    setCategoryId(o.categoryId)
    setSettledAtSource(o.settledAtSource)
    setAmountMajor(String(fromMinor(o.totalAmount, money.decimalPlaces)))
    // Picking a bill is an explicit pot choice; don't let the description
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
      categoryId: potId ? null : categoryId,
      settledAtSource,
    })

    await Promise.all([utils.spends.list.invalidate(), utils.reconcile.backlog.invalidate()])

    // If this was logged from a bill and the amount differs, offer to update the
    // bill going forward. (Refunds never redefine an expected cost.)
    let nextUpdate: typeof pendingUpdate = null
    if (kind === 'spend' && selectedOutgoing && minor !== selectedOutgoing.totalAmount) {
      nextUpdate = {
        expenseId: selectedOutgoing.expenseId,
        name: selectedOutgoing.name,
        from: selectedOutgoing.totalAmount,
        to: minor,
        amount: minor,
      }
    }
    setPendingUpdate(nextUpdate)

    const potName = inserted.potId ? potById.get(inserted.potId)?.name : null
    setSuccessMessage(
      settledAtSource
        ? `Logged ${formatMoney(Math.abs(inserted.amount), money)} — already settled, no catch-up needed`
        : `Logged ${formatMoney(Math.abs(inserted.amount), money)}${potName ? ` — take from ${potName}` : ' — needs a pot'}`,
    )

    resetForm(ownerId)
  }

  async function applyOutgoingUpdate() {
    if (!pendingUpdate) return
    // No optimistic-lock guard here: this "update the bill going forward" prompt
    // is driven by a plan projection that doesn't carry the bill's updatedAt, so
    // it stays last-write-wins (see issue #23). The bill edit form is guarded.
    await updateExpense.mutateAsync({
      id: pendingUpdate.expenseId,
      amount: pendingUpdate.amount,
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
            Who paid?
          </Text>
          <SegmentedControl
            fullWidth
            value={ownerId ?? ''}
            onChange={(v) => setOwnerId(v || null)}
            data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </div>
        <SpendFundingFields
          value={{ potId, categoryId, settledAtSource }}
          onChange={(f) => {
            setPotId(f.potId)
            setCategoryId(f.categoryId)
            setSettledAtSource(f.settledAtSource)
            // Any explicit funding choice stops the description-based pot suggestion.
            setPotManuallyChosen(true)
          }}
          pots={pots}
          members={members}
          categories={categories}
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
          <Button
            variant="default"
            onClick={() => {
              resetForm(ownerId)
              setSuccessMessage('')
              setPendingUpdate(null)
            }}
          >
            Reset
          </Button>
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
              label={i === 0 ? 'Who paid' : undefined}
              data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
              value={p.ownerId}
              onChange={(v) => update(i, { ownerId: v ?? p.ownerId })}
              allowDeselect={false}
              w={130}
            />
            <Select
              label={i === 0 ? 'Pot' : undefined}
              placeholder="No pot (assign later)"
              data={groupedPotOptions(pots, members)}
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
    await update.mutateAsync({ id: spend.id, expectedUpdatedAt: spend.updatedAt, potId: v })
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
  const categories = trpc.categories.list.useQuery().data ?? []
  const orderedMembers = orderMembers(members)

  const [amountMajor, setAmountMajor] = useState<string>(
    String(fromMinor(Math.abs(spend.amount), money.decimalPlaces)),
  )
  const [kind, setKind] = useState<'spend' | 'refund'>(spend.amount < 0 ? 'refund' : 'spend')
  const [description, setDescription] = useState(spend.description)
  const [date, setDate] = useState<string | null>(spend.date)
  const [ownerId, setOwnerId] = useState<string | null>(spend.ownerId)
  const [potId, setPotId] = useState<string | null>(spend.potId)
  const [categoryId, setCategoryId] = useState<string | null>(spend.categoryId)
  const [settledAtSource, setSettledAtSource] = useState(spend.settledAtSource === 1)
  const [error, setError] = useState('')

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
        expectedUpdatedAt: spend.updatedAt,
        date: date ?? undefined,
        description: trimmed,
        amount: kind === 'refund' ? -minor : minor,
        ownerId,
        potId: potId || null,
        categoryId: potId ? null : categoryId,
        settledAtSource,
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
            Who paid?
          </Text>
          <SegmentedControl
            fullWidth
            value={ownerId ?? ''}
            onChange={(v) => setOwnerId(v || null)}
            data={orderedMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </div>
        <SpendFundingFields
          value={{ potId, categoryId, settledAtSource }}
          onChange={(f) => {
            setPotId(f.potId)
            setCategoryId(f.categoryId)
            setSettledAtSource(f.settledAtSource)
          }}
          pots={pots}
          members={members}
          categories={categories}
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
  categories,
}: {
  spend: SpendTransaction
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  categories: Category[]
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
  // No pot + settled = a main-account spend (not "needs a pot").
  const isMainAccount = !spend.potId && spend.settledAtSource === 1
  const categoryName = spend.categoryId ? categories.find((c) => c.id === spend.categoryId)?.name : null

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
          ) : isMainAccount ? (
            <Text size="sm" c="dimmed">
              Main account{categoryName ? ` · ${categoryName}` : ''}
            </Text>
          ) : (
            <Group gap="xs" wrap="nowrap">
              <Badge size="sm" color="apricot" variant="light">
                Needs a pot
              </Badge>
              <AssignPotCell spend={spend} pots={pots} />
            </Group>
          )}
        </Table.Td>
        <Table.Td style={{ whiteSpace: 'nowrap' }}>
          {spend.reconciled === 1 ? (
            <Badge size="sm" color="moss" variant="light" styles={{ root: { maxWidth: 'none' }, label: { overflow: 'visible' } }}>
              Reconciled
            </Badge>
          ) : spend.settledAtSource === 1 ? (
            <Badge size="sm" color="teal" variant="light" styles={{ root: { maxWidth: 'none' }, label: { overflow: 'visible' } }}>
              Settled
            </Badge>
          ) : (
            <Badge size="sm" color="sand" variant="light" styles={{ root: { maxWidth: 'none' }, label: { overflow: 'visible' } }}>
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

  // Page through history rather than loading and rendering the whole table: fetch
  // `limit + 1` so we know whether a "Load more" is warranted, and reset to the
  // first page whenever the filters change.
  const PAGE_SIZE = 100
  const [pages, setPages] = useState(1)
  useEffect(() => setPages(1), [input])
  const limit = pages * PAGE_SIZE

  const spendsQuery = trpc.spends.list.useQuery({ ...input, limit: limit + 1 })
  const allRows = spendsQuery.data ?? []
  const hasMore = allRows.length > limit
  const spends = hasMore ? allRows.slice(0, limit) : allRows
  // Queried once here and passed to every row, rather than each SpendRow mounting
  // its own categories.list subscription.
  const categories = trpc.categories.list.useQuery().data ?? []

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
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {spends.map((s) => (
                  <SpendRow key={s.id} spend={s} members={members} pots={pots} money={money} categories={categories} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {!spendsQuery.isLoading && hasMore && (
          <Group justify="center">
            <Button variant="default" size="xs" onClick={() => setPages((p) => p + 1)}>
              Load more
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SpendingPage
// ---------------------------------------------------------------------------

export function SpendingPage() {
  const membersQuery = trpc.members.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()

  const money = useMoney()

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
