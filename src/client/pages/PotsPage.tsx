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
import type { Category, Member, Pot, SetAside } from '../../server/db/schema'
import { formatMoney, fromMinor, toMinor } from '../../shared/money'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { orderMembers } from '../potOptions'

interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
}

/** Monthly-equivalent total of a pot's contribution lines. */
function contributionMonthly(lines: SetAside[]): number {
  return roundMinor(lines.reduce((acc, s) => acc + normaliseToMonthly(s.amount, s.recurrence as Recurrence), 0))
}

// ---------------------------------------------------------------------------
// Pots panel
// ---------------------------------------------------------------------------

interface PotRowProps {
  pot: Pot
  members: Member[]
  categories: Category[]
  unused: boolean
  setAsides: SetAside[]
  money: MoneyFormat
}

/** Set-asides only use these three; narrower than the shared Recurrence union. */
type ContribRecurrence = 'monthly' | 'quarterly' | 'yearly'

/** One editable contribution line: a monthly amount, optionally named for a breakdown. */
interface ContribLine {
  label: string
  amountMajor: string
  recurrence: ContribRecurrence
}

function linesFromSetAsides(setAsides: SetAside[], pot: Pot, decimalPlaces: number): ContribLine[] {
  if (setAsides.length === 0) return [{ label: '', amountMajor: '', recurrence: 'monthly' }]
  return setAsides.map((s) => ({
    label: s.name === pot.name ? '' : s.name,
    amountMajor: String(fromMinor(s.amount, decimalPlaces)),
    recurrence: s.recurrence as ContribRecurrence,
  }))
}

function PotRow({ pot, members, categories, unused, setAsides, money }: PotRowProps) {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const [name, setName] = useState(pot.name)
  const [ownerId, setOwnerId] = useState<string>(pot.ownerId)
  const [categoryId, setCategoryId] = useState<string | null>(pot.categoryId)
  const [note, setNote] = useState(pot.note ?? '')
  const [lines, setLines] = useState<ContribLine[]>(() => linesFromSetAsides(setAsides, pot, money.decimalPlaces))

  const update = trpc.pots.update.useMutation()
  const archive = trpc.pots.archive.useMutation()
  const replaceContrib = trpc.setAside.replaceForPot.useMutation()

  const owner = members.find((m) => m.id === pot.ownerId)
  const contribTotal = contributionMonthly(setAsides)
  const hasBreakdown = setAsides.length > 1

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  function updateLine(i: number, patch: Partial<ContribLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, { label: '', amountMajor: '', recurrence: 'monthly' }])
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function resetEdits() {
    setName(pot.name)
    setOwnerId(pot.ownerId)
    setCategoryId(pot.categoryId)
    setNote(pot.note ?? '')
    setLines(linesFromSetAsides(setAsides, pot, money.decimalPlaces))
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    await update.mutateAsync({
      id: pot.id,
      name: trimmed,
      ownerId,
      categoryId: categoryId,
      note: note.trim(),
    })
    await replaceContrib.mutateAsync({
      potId: pot.id,
      lines: lines.map((l) => ({
        label: l.label.trim() || null,
        amount: l.amountMajor === '' ? 0 : toMinor(Number(l.amountMajor), money.decimalPlaces),
        recurrence: l.recurrence,
      })),
    })
    await Promise.all([utils.pots.list.invalidate(), utils.setAside.list.invalidate(), utils.plan.funding.invalidate()])
    setEditing(false)
  }

  async function handleArchive() {
    await archive.mutateAsync({ id: pot.id })
    await utils.pots.list.invalidate()
    setConfirmArchive(false)
  }

  if (editing) {
    return (
      <Card withBorder padding="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
          onKeyDown={(e) => {
            // Escape cancels the edit — but let an open Select swallow its own
            // Escape (closing the dropdown) rather than bailing out of the edit.
            if (e.key === 'Escape' && !e.defaultPrevented) {
              e.preventDefault()
              resetEdits()
              setEditing(false)
            }
          }}
        >
        <Stack gap="xs">
          <TextInput
            label="Name"
            size="xs"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
          />
          <Group grow>
            <Select
              label="Owner"
              size="xs"
              data={memberOptions}
              value={ownerId}
              onChange={(v) => setOwnerId(v ?? pot.ownerId)}
              allowDeselect={false}
            />
            <Select
              label="Category"
              size="xs"
              data={categoryOptions}
              value={categoryId}
              onChange={(v) => setCategoryId(v)}
              searchable
              clearable
              placeholder="Uncategorised"
            />
          </Group>
          <TextInput
            label="Note"
            size="xs"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />

          <Divider label="Monthly contribution" labelPosition="left" />
          <Text size="xs" c="dimmed">
            How much to move into this pot each month. Add parts to break it down (e.g. Running £10, Squash £5).
          </Text>
          <Stack gap="xs">
            {lines.map((line, i) => (
              <Group key={i} gap="xs" align="flex-end" wrap="nowrap">
                {lines.length > 1 && (
                  <TextInput
                    size="xs"
                    placeholder="Part (e.g. Running)"
                    value={line.label}
                    onChange={(e) => updateLine(i, { label: e.currentTarget.value })}
                    style={{ flex: 1 }}
                  />
                )}
                <NumberInput
                  size="xs"
                  placeholder="0.00"
                  prefix={money.symbol}
                  decimalScale={money.decimalPlaces}
                  fixedDecimalScale
                  min={0}
                  value={line.amountMajor}
                  onChange={(v) => updateLine(i, { amountMajor: v === '' ? '' : String(v) })}
                  w={lines.length > 1 ? 120 : undefined}
                  style={lines.length > 1 ? undefined : { flex: 1 }}
                />
                {line.recurrence !== 'monthly' && (
                  <Text size="xs" c="dimmed">
                    /{line.recurrence}
                  </Text>
                )}
                {lines.length > 1 && (
                  <ActionIcon variant="subtle" color="red" size="sm" aria-label="Remove part" onClick={() => removeLine(i)}>
                    ×
                  </ActionIcon>
                )}
              </Group>
            ))}
            <Group>
              <Button size="xs" variant="subtle" onClick={addLine}>
                {lines.length > 1 ? '+ Add part' : '+ Break down'}
              </Button>
            </Group>
          </Stack>

          {(update.error || replaceContrib.error) && (
            <Alert color="red" title="Error">
              {update.error?.message || replaceContrib.error?.message}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              size="xs"
              type="button"
              variant="default"
              onClick={() => {
                resetEdits()
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button size="xs" type="submit" loading={update.isPending || replaceContrib.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
        </form>
      </Card>
    )
  }

  return (
    <>
      <Group
        justify="space-between"
        px="xs"
        py={6}
        wrap="nowrap"
        style={{
          borderRadius: 6,
          background: 'light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))',
        }}
      >
        <Group gap="xs" wrap="wrap">
          <Text size="sm" fw={500}>
            {pot.name}
          </Text>
          {owner && (
            <Badge
              size="sm"
              variant="light"
              color={owner.color ?? undefined}
              style={
                owner.color
                  ? {
                      backgroundColor: owner.color + '22',
                      color: owner.color,
                      borderColor: owner.color + '55',
                    }
                  : undefined
              }
            >
              {owner.displayName}
            </Badge>
          )}
          {unused && (
            <Badge
              size="sm"
              variant="outline"
              color="gray"
              title="Never referenced by an outgoing, spend, or reconciliation — safe to delete"
            >
              unused
            </Badge>
          )}
          {contribTotal > 0 && (
            <Text
              size="xs"
              c="dimmed"
              title={
                hasBreakdown
                  ? setAsides.map((s) => `${s.name} ${formatMoney(s.amount, money)}`).join(' · ')
                  : undefined
              }
            >
              · {formatMoney(contribTotal, money)}/mo in{hasBreakdown ? ` (${setAsides.length} parts)` : ''}
            </Text>
          )}
          {pot.note && (
            <Text size="xs" c="dimmed">
              {pot.note}
            </Text>
          )}
        </Group>
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Edit ${pot.name}`}
            onClick={() => setEditing(true)}
          >
            ✎
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Archive ${pot.name}`}
            onClick={() => setConfirmArchive(true)}
          >
            ×
          </ActionIcon>
        </Group>
      </Group>
      <Modal
        opened={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive pot?"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{pot.name}</strong>? This can't be undone from here.
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

interface AddPotFormProps {
  members: Member[]
  categories: Category[]
}

function AddPotForm({ members, categories }: AddPotFormProps) {
  const utils = trpc.useUtils()
  const create = trpc.pots.create.useMutation()

  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a pot name.')
      return
    }
    if (!ownerId) {
      setError('Please choose an owner.')
      return
    }
    setError('')
    await create.mutateAsync({
      name: trimmed,
      ownerId,
      categoryId: categoryId ?? undefined,
      note: note.trim() || undefined,
    })
    await utils.pots.list.invalidate()
    setName('')
    setCategoryId(null)
    setNote('')
  }

  return (
    <Stack gap="sm">
      <Divider label="Add a pot" labelPosition="left" />
      <Group grow align="flex-end">
        <TextInput
          label="Name"
          placeholder="e.g. Holiday fund"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setError('')
          }}
        />
        <Select
          label="Owner"
          placeholder="Choose owner"
          data={memberOptions}
          value={ownerId}
          onChange={(v) => {
            setOwnerId(v)
            setError('')
          }}
        />
        <Select
          label="Category"
          placeholder="Uncategorised"
          data={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          searchable
          clearable
        />
      </Group>
      <Group align="flex-end" justify="space-between">
        <TextInput
          label="Note (optional)"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button onClick={() => void handleAdd()} loading={create.isPending} ml="md">
          Add pot
        </Button>
      </Group>
      {(error || create.error) && (
        <Alert color="red" title="Error">
          {error || create.error?.message}
        </Alert>
      )}
    </Stack>
  )
}

function PotsPanel({
  pots,
  categories,
  members,
  usedIds,
  usageReady,
  isLoading,
  setAsidesByPot,
  money,
}: {
  pots: Pot[]
  categories: Category[]
  members: Member[]
  usedIds: Set<string>
  usageReady: boolean
  isLoading: boolean
  setAsidesByPot: Map<string, SetAside[]>
  money: MoneyFormat
}) {
  const orderedOwners = orderMembers(members)
  const orderedCategoryIds = categories.map((c) => c.id)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const unusedCount = usageReady ? pots.filter((p) => !usedIds.has(p.id)).length : 0

  /** Group an owner's pots by category (null bucket last), pots A–Z within. */
  function potsByCategory(ownerPots: Pot[]): Array<{ catId: string | null; name: string; items: Pot[] }> {
    const byCat = new Map<string | null, Pot[]>()
    for (const p of [...ownerPots].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = p.categoryId && categoryById.has(p.categoryId) ? p.categoryId : null
      const arr = byCat.get(key) ?? []
      arr.push(p)
      byCat.set(key, arr)
    }
    const sections: Array<{ catId: string | null; name: string; items: Pot[] }> = []
    for (const catId of orderedCategoryIds) {
      const items = byCat.get(catId)
      if (items?.length) sections.push({ catId, name: categoryById.get(catId)?.name ?? '', items })
    }
    const uncat = byCat.get(null)
    if (uncat?.length) sections.push({ catId: null, name: 'Uncategorised', items: uncat })
    return sections
  }

  return (
    <Stack gap="md">
      {unusedCount > 0 && (
        <Text size="xs" c="dimmed">
          {unusedCount} unused pot{unusedCount === 1 ? '' : 's'} — never referenced by a bill or spend, safe to delete.
        </Text>
      )}
      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}
      {!isLoading && pots.length === 0 && (
        <Text size="sm" c="dimmed">
          No pots yet — add one below.
        </Text>
      )}

      {orderedOwners.map((owner) => {
        const ownerPots = pots.filter((p) => p.ownerId === owner.id)
        if (ownerPots.length === 0) return null
        const sections = potsByCategory(ownerPots)
        return (
          <Card key={owner.id} withBorder padding="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Title order={4}>{owner.displayName}</Title>
                <Badge size="sm" variant="light" color={owner.color ?? 'gray'}>
                  {owner.kind === 'joint' ? 'joint' : 'personal'}
                </Badge>
              </Group>
              {sections.map((section) => (
                <Stack key={section.catId ?? 'none'} gap={4}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    {section.name}
                  </Text>
                  <Stack gap={2}>
                    {section.items.map((p) => (
                      <PotRow
                        key={p.id}
                        pot={p}
                        members={members}
                        categories={categories}
                        unused={usageReady && !usedIds.has(p.id)}
                        setAsides={setAsidesByPot.get(p.id) ?? []}
                        money={money}
                      />
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Card>
        )
      })}

      <Card withBorder padding="md">
        <AddPotForm members={members} categories={categories} />
      </Card>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// PotsPage
// ---------------------------------------------------------------------------

export function PotsPage() {
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const categoriesQuery = trpc.categories.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()
  const usedIdsQuery = trpc.pots.usedIds.useQuery()
  const setAsidesQuery = trpc.setAside.list.useQuery()

  const categories = categoriesQuery.data ?? []
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const usedIds = new Set(usedIdsQuery.data ?? [])

  const household = ctxQuery.data?.household
  const money: MoneyFormat = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const setAsidesByPot = new Map<string, SetAside[]>()
  for (const s of setAsidesQuery.data ?? []) {
    const arr = setAsidesByPot.get(s.potId) ?? []
    arr.push(s)
    setAsidesByPot.set(s.potId, arr)
  }
  for (const arr of setAsidesByPot.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Title order={2}>Pots</Title>
      <PotsPanel
        pots={pots}
        categories={categories}
        members={members}
        usedIds={usedIds}
        usageReady={usedIdsQuery.isSuccess}
        isLoading={potsQuery.isLoading || membersQuery.isLoading}
        setAsidesByPot={setAsidesByPot}
        money={money}
      />
    </Stack>
  )
}
