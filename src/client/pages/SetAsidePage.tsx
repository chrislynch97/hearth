import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Autocomplete,
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
import type { Member, Pot, SetAside } from '../../server/db/schema'
import { fromMinor, formatMoney, toMinor } from '../../shared/money'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { groupedPotOptions, orderMembers } from '../potOptions'

type SetAsideRecurrence = 'monthly' | 'quarterly' | 'yearly'

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

// ---------------------------------------------------------------------------
// Add / edit modal
// ---------------------------------------------------------------------------

function SetAsideFormModal({
  opened,
  onClose,
  members,
  pots,
  money,
  setAside,
  existingGroupLabels,
}: {
  opened: boolean
  onClose: () => void
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  setAside: SetAside | null
  existingGroupLabels: string[]
}) {
  const utils = trpc.useUtils()
  const create = trpc.setAside.create.useMutation()
  const update = trpc.setAside.update.useMutation()

  const [name, setName] = useState(setAside?.name ?? '')
  const [groupLabel, setGroupLabel] = useState(setAside?.groupLabel ?? '')
  const [ownerId, setOwnerId] = useState<string | null>(setAside?.ownerId ?? orderMembers(members)[0]?.id ?? null)
  const [potId, setPotId] = useState<string | null>(setAside?.potId ?? null)
  const [amountMajor, setAmountMajor] = useState(
    setAside ? String(fromMinor(setAside.amount, money.decimalPlaces)) : '',
  )
  const [recurrence, setRecurrence] = useState<SetAsideRecurrence>((setAside?.recurrence as SetAsideRecurrence) ?? 'monthly')
  const [error, setError] = useState('')

  const isEditing = setAside !== null
  const pending = create.isPending || update.isPending
  const potGroups = groupedPotOptions(pots, members)

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Please enter a name.')
    if (!ownerId) return setError('Please choose who sets this aside.')
    if (!potId) return setError('Please choose the pot to fill.')
    if (amountMajor === '' || Number(amountMajor) <= 0) return setError('Please enter an amount.')
    setError('')

    const payload = {
      name: trimmed,
      groupLabel: groupLabel.trim() || null,
      ownerId,
      potId,
      amount: toMinor(Number(amountMajor), money.decimalPlaces),
      recurrence,
    }
    if (isEditing) await update.mutateAsync({ id: setAside.id, ...payload })
    else await create.mutateAsync(payload)

    await Promise.all([utils.setAside.list.invalidate(), utils.plan.funding.invalidate()])
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit set-aside' : 'Add set-aside'} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <Stack gap="sm">
        <TextInput label="Name" placeholder="e.g. Treat Yo Self" value={name} onChange={(e) => setName(e.currentTarget.value)} autoFocus />
        <Autocomplete
          label="Group label (optional)"
          description="Share a name across per-person rows, e.g. both halves of “Treat Yo Self”. Pick an existing one or type a new one."
          placeholder="Start typing…"
          data={existingGroupLabels}
          value={groupLabel}
          onChange={setGroupLabel}
        />
        <Group grow>
          <Select
            label="Who sets it aside"
            data={orderMembers(members).map((m) => ({ value: m.id, label: m.displayName }))}
            value={ownerId}
            onChange={setOwnerId}
            allowDeselect={false}
          />
          <Select label="Into pot" placeholder="Pick a pot" data={potGroups} value={potId} onChange={setPotId} searchable />
        </Group>
        <Group grow>
          <NumberInput
            label="Amount"
            placeholder="0.00"
            prefix={money.symbol}
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            value={amountMajor}
            onChange={(v) => setAmountMajor(v === '' ? '' : String(v))}
          />
          <Select
            label="Recurrence"
            data={RECURRENCE_OPTIONS}
            value={recurrence}
            onChange={(v) => setRecurrence((v as SetAsideRecurrence) ?? 'monthly')}
            allowDeselect={false}
          />
        </Group>
        {(error || create.error || update.error) && (
          <Alert color="red" title="Error">
            {error || create.error?.message || update.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button type="button" variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {isEditing ? 'Save' : 'Add set-aside'}
          </Button>
        </Group>
        </Stack>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function SetAsideRow({
  setAside,
  members,
  pots,
  money,
  onEdit,
}: {
  setAside: SetAside
  members: Member[]
  pots: Pot[]
  money: MoneyFormat
  onEdit: () => void
}) {
  const utils = trpc.useUtils()
  const archive = trpc.setAside.archive.useMutation()
  const [confirmArchive, setConfirmArchive] = useState(false)

  const owner = members.find((m) => m.id === setAside.ownerId)
  const potName = pots.find((p) => p.id === setAside.potId)?.name ?? 'unknown pot'
  const monthly = roundMinor(normaliseToMonthly(setAside.amount, setAside.recurrence as Recurrence))

  async function handleArchive() {
    await archive.mutateAsync({ id: setAside.id })
    await Promise.all([utils.setAside.list.invalidate(), utils.plan.funding.invalidate()])
    setConfirmArchive(false)
  }

  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={4}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600}>{setAside.name}</Text>
            <Badge size="sm" variant="light">
              {setAside.recurrence}
            </Badge>
            {owner && (
              <Badge size="sm" variant="light" color={owner.color ?? 'gray'}>
                {owner.displayName}
              </Badge>
            )}
          </Group>
          <Group gap={8} wrap="wrap">
            <Text size="sm">{formatMoney(setAside.amount, money)}</Text>
            <Text size="xs" c="dimmed">
              {formatMoney(monthly, money)}/mo
            </Text>
            <Text size="xs" c="dimmed">
              → {potName}
            </Text>
          </Group>
        </Stack>
        <Group gap={4}>
          <ActionIcon variant="subtle" size="sm" aria-label={`Edit ${setAside.name}`} onClick={onEdit}>
            ✎
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Archive ${setAside.name}`} onClick={() => setConfirmArchive(true)}>
            ×
          </ActionIcon>
        </Group>
      </Group>
      <Modal opened={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive set-aside?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{setAside.name}</strong>? This can't be undone from here.
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
// Page
// ---------------------------------------------------------------------------

export function SetAsidePage() {
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const listQuery = trpc.setAside.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()

  const [formOpened, setFormOpened] = useState(false)
  const [editing, setEditing] = useState<SetAside | null>(null)

  const household = ctxQuery.data?.household
  const money: MoneyFormat = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const items = listQuery.data ?? []
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const isLoading = listQuery.isLoading || potsQuery.isLoading || membersQuery.isLoading

  // Collapse set-asides that share a groupLabel into one card (e.g. both halves of
  // "Treat Yo Self"); the rest stand alone. List order is preserved — a label's
  // first appearance fixes its position.
  type Section = { kind: 'group'; label: string; rows: SetAside[] } | { kind: 'single'; row: SetAside }
  const sections: Section[] = []
  const groupAt = new Map<string, number>()
  for (const s of items) {
    if (s.groupLabel) {
      const at = groupAt.get(s.groupLabel)
      if (at === undefined) {
        groupAt.set(s.groupLabel, sections.length)
        sections.push({ kind: 'group', label: s.groupLabel, rows: [s] })
      } else {
        ;(sections[at] as { rows: SetAside[] }).rows.push(s)
      }
    } else {
      sections.push({ kind: 'single', row: s })
    }
  }
  const groupMonthly = (rows: SetAside[]) =>
    roundMinor(rows.reduce((a, r) => a + normaliseToMonthly(r.amount, r.recurrence as Recurrence), 0))

  const existingGroupLabels = [...new Set(items.map((s) => s.groupLabel).filter((g): g is string => !!g))].sort()

  function openAdd() {
    setEditing(null)
    setFormOpened(true)
  }
  function openEdit(s: SetAside) {
    setEditing(s)
    setFormOpened(true)
  }

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between">
        <div>
          <Title order={2}>Set aside</Title>
          <Text size="sm" c="dimmed">
            Recurring money you move into a pot (savings goals, personal spending). Never shows up on Spending or Catch-up.
          </Text>
        </div>
        <Button onClick={openAdd}>Add set-aside</Button>
      </Group>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && items.length === 0 && (
        <Text c="dimmed">Nothing set aside yet — add a recurring pot contribution to start.</Text>
      )}

      <Stack gap="sm">
        {sections.map((section) =>
          section.kind === 'single' ? (
            <Card key={section.row.id} withBorder padding="sm">
              <SetAsideRow setAside={section.row} members={members} pots={pots} money={money} onEdit={() => openEdit(section.row)} />
            </Card>
          ) : (
            <Card key={`group:${section.label}`} withBorder padding="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={700}>{section.label}</Text>
                  <Text size="sm" c="dimmed">
                    {formatMoney(groupMonthly(section.rows), money)}/mo
                  </Text>
                </Group>
                <Divider />
                <Stack gap="sm">
                  {section.rows.map((r, i) => (
                    <div key={r.id}>
                      {i > 0 && <Divider mb="sm" />}
                      <SetAsideRow setAside={r} members={members} pots={pots} money={money} onEdit={() => openEdit(r)} />
                    </div>
                  ))}
                </Stack>
              </Stack>
            </Card>
          ),
        )}
      </Stack>

      {formOpened && (
        <SetAsideFormModal
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          members={members}
          pots={pots}
          money={money}
          setAside={editing}
          existingGroupLabels={existingGroupLabels}
        />
      )}
    </Stack>
  )
}
