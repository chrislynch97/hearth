import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
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
import { useMoney, type MoneyFormat } from '../useMoney'
import { notifySuccess } from '../notify'
import { useIsMobile } from '@/useIsMobile'
import { EditableListRow } from '@/components/EditableListRow'

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
  includeInEmergencyFund: boolean
}

const blankLine = (): ContribLine => ({ label: '', amountMajor: '', recurrence: 'monthly', includeInEmergencyFund: true })

function linesFromSetAsides(setAsides: SetAside[], pot: Pot, decimalPlaces: number): ContribLine[] {
  if (setAsides.length === 0) return [blankLine()]
  return setAsides.map((s) => ({
    label: s.name === pot.name ? '' : s.name,
    amountMajor: String(fromMinor(s.amount, decimalPlaces)),
    recurrence: s.recurrence as ContribRecurrence,
    includeInEmergencyFund: s.includeInEmergencyFund !== 0,
  }))
}

function PotRow({ pot, members, categories, unused, setAsides, money }: PotRowProps) {
  const utils = trpc.useUtils()
  const isMobile = useIsMobile()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const archive = trpc.pots.archive.useMutation()

  const owner = members.find((m) => m.id === pot.ownerId)
  const contribTotal = contributionMonthly(setAsides)
  const hasBreakdown = setAsides.length > 1

  async function handleArchive() {
    try {
      await archive.mutateAsync({ id: pot.id })
    } catch {
      return // error surfaced by the global handler; keep the dialog open
    }
    await utils.pots.list.invalidate()
    setConfirmArchive(false)
    notifySuccess(`Archived ${pot.name}.`)
  }

  const ownerBadge = owner && (
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
  )
  const unusedBadge = unused && (
    <Badge
      size="sm"
      variant="outline"
      color="gray"
      title="Never referenced by an outgoing, spend, or reconciliation — safe to delete"
    >
      unused
    </Badge>
  )
  const contribTitle = hasBreakdown
    ? setAsides.map((s) => `${s.name} ${formatMoney(s.amount, money)}`).join(' · ')
    : undefined
  const contribText =
    contribTotal > 0
      ? `${formatMoney(contribTotal, money)}/mo in${hasBreakdown ? ` (${setAsides.length} parts)` : ''}`
      : ''

  return (
    <>
      <EditableListRow
        onEdit={() => setEditOpen(true)}
        onDelete={() => setConfirmArchive(true)}
        editLabel={`Edit ${pot.name}`}
        deleteLabel={`Archive ${pot.name}`}
        style={{ background: 'light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))' }}
      >
        {isMobile ? (
          // Two lines, not one wrapping row: the name, its badges, the monthly
          // contribution and the note all flowing together is what makes this
          // list unreadable on a phone.
          <Stack gap={2}>
            <Group gap="xs" wrap="nowrap" preventGrowOverflow={false}>
              <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                {pot.name}
              </Text>
              {ownerBadge}
              {unusedBadge}
            </Group>
            {(contribText || pot.note) && (
              <Text size="xs" c="dimmed" truncate title={contribTitle}>
                {[contribText, pot.note].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Stack>
        ) : (
          <Group gap="xs" wrap="wrap">
            <Text size="sm" fw={500}>
              {pot.name}
            </Text>
            {ownerBadge}
            {unusedBadge}
            {contribText && (
              <Text size="xs" c="dimmed" title={contribTitle}>
                · {contribText}
              </Text>
            )}
            {pot.note && (
              <Text size="xs" c="dimmed">
                {pot.note}
              </Text>
            )}
          </Group>
        )}
      </EditableListRow>
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
      {editOpen && (
        <PotFormModal
          opened={editOpen}
          onClose={() => setEditOpen(false)}
          members={members}
          categories={categories}
          money={money}
          pot={pot}
          setAsides={setAsides}
          onArchive={
            isMobile
              ? () => {
                  setEditOpen(false)
                  setConfirmArchive(true)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

/** Add or edit a pot — name, owner, category, note, and its monthly contribution
 *  (a single amount or several named parts). Shared by the page header (add) and
 *  each pot row (edit) so the two never drift. */
function PotFormModal({
  opened,
  onClose,
  members,
  categories,
  money,
  pot,
  setAsides = [],
  onArchive,
}: {
  opened: boolean
  onClose: () => void
  members: Member[]
  categories: Category[]
  money: MoneyFormat
  pot?: Pot
  setAsides?: SetAside[]
  /** Touch only: with no × on the row, the destructive action lives in here. */
  onArchive?: () => void
}) {
  const utils = trpc.useUtils()
  const create = trpc.pots.createWithContributions.useMutation()
  const update = trpc.pots.update.useMutation()
  const replaceContrib = trpc.setAside.replaceForPot.useMutation()
  const isEditing = !!pot

  const [name, setName] = useState(pot?.name ?? '')
  const [ownerId, setOwnerId] = useState<string | null>(pot?.ownerId ?? null)
  const [categoryId, setCategoryId] = useState<string | null>(pot?.categoryId ?? null)
  const [note, setNote] = useState(pot?.note ?? '')
  const [lines, setLines] = useState<ContribLine[]>(() =>
    pot ? linesFromSetAsides(setAsides, pot, money.decimalPlaces) : [blankLine()],
  )
  const [error, setError] = useState('')

  const memberOptions = orderMembers(members).map((m) => ({ value: m.id, label: m.displayName }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const pending = create.isPending || update.isPending || replaceContrib.isPending

  function updateLine(i: number, patch: Partial<ContribLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()])
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Please enter a pot name.')
    if (!ownerId) return setError('Please choose an owner.')
    setError('')

    const contribLines = lines.map((l) => ({
      label: l.label.trim() || null,
      amount: l.amountMajor === '' ? 0 : toMinor(Number(l.amountMajor), money.decimalPlaces),
      recurrence: l.recurrence,
      includeInEmergencyFund: l.includeInEmergencyFund,
    }))

    try {
      if (isEditing) {
        // Edit is still two writes (metadata, then contributions); replaceForPot
        // is itself atomic, and neither leaves an orphaned pot the way a failed
        // create did, so the create path is the only one that needs a combined
        // resolver.
        await update.mutateAsync({ id: pot.id, expectedUpdatedAt: pot.updatedAt, name: trimmed, ownerId, categoryId, note: note.trim() })
        await replaceContrib.mutateAsync({ potId: pot.id, lines: contribLines })
      } else {
        await create.mutateAsync({ name: trimmed, ownerId, categoryId: categoryId ?? undefined, note: note.trim() || undefined, lines: contribLines })
      }
    } catch {
      return // error surfaced by the global handler; keep the form open to retry
    }

    await Promise.all([utils.pots.list.invalidate(), utils.setAside.list.invalidate(), utils.plan.funding.invalidate()])
    notifySuccess(isEditing ? `Saved ${trimmed}.` : `Added ${trimmed}.`)
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit pot' : 'Add pot'} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="e.g. Holiday fund"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              setError('')
            }}
            data-autofocus
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              label="Owner"
              placeholder="Choose owner"
              data={memberOptions}
              value={ownerId}
              onChange={(v) => {
                setOwnerId(v)
                setError('')
              }}
              allowDeselect={false}
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
          </SimpleGrid>
          <TextInput label="Note (optional)" placeholder="Optional note" value={note} onChange={(e) => setNote(e.currentTarget.value)} />

          <Divider label="Monthly contribution" labelPosition="left" />
          <Text size="xs" c="dimmed">
            How much to move into this pot each month. Add parts to break it down (e.g. Running £10, Squash £5).
          </Text>
          <Stack gap="xs">
            {lines.map((line, i) => (
              <Stack key={i} gap={4}>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  {lines.length > 1 && (
                    <TextInput
                      placeholder="Part (e.g. Running)"
                      value={line.label}
                      onChange={(e) => updateLine(i, { label: e.currentTarget.value })}
                      style={{ flex: 1 }}
                    />
                  )}
                  <NumberInput
                    placeholder="0.00"
                    prefix={money.symbol}
                    decimalScale={money.decimalPlaces}
                    fixedDecimalScale
                    min={0}
                    value={line.amountMajor}
                    onChange={(v) => updateLine(i, { amountMajor: v === '' ? '' : String(v) })}
                    w={lines.length > 1 ? 130 : undefined}
                    style={lines.length > 1 ? undefined : { flex: 1 }}
                  />
                  {line.recurrence !== 'monthly' && (
                    <Text size="xs" c="dimmed">
                      /{line.recurrence}
                    </Text>
                  )}
                  {lines.length > 1 && (
                    <ActionIcon variant="subtle" color="red" size="lg" aria-label="Remove part" onClick={() => removeLine(i)}>
                      ×
                    </ActionIcon>
                  )}
                </Group>
                <Checkbox
                  size="xs"
                  label="Include in emergency fund"
                  checked={line.includeInEmergencyFund}
                  onChange={(e) => updateLine(i, { includeInEmergencyFund: e.currentTarget.checked })}
                />
              </Stack>
            ))}
            <Group>
              <Button size="xs" variant="subtle" onClick={addLine}>
                {lines.length > 1 ? '+ Add part' : '+ Break down'}
              </Button>
            </Group>
          </Stack>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}
          <Group justify={onArchive ? 'space-between' : 'flex-end'}>
            {onArchive && (
              <Button type="button" variant="subtle" color="red" onClick={onArchive}>
                Archive
              </Button>
            )}
            <Group gap="xs">
              <Button type="button" variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {isEditing ? 'Save' : 'Add pot'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
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
        const ownerMonthly = roundMinor(
          ownerPots.reduce((acc, p) => acc + contributionMonthly(setAsidesByPot.get(p.id) ?? []), 0),
        )
        return (
          <Card key={owner.id} withBorder padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <Title order={4}>{owner.displayName}</Title>
                  <Badge size="sm" variant="light" color={owner.color ?? 'gray'}>
                    {owner.kind === 'joint' ? 'joint' : 'personal'}
                  </Badge>
                </Group>
                {ownerMonthly > 0 && (
                  <Text size="sm" c="dimmed">
                    {formatMoney(ownerMonthly, money)}/mo in
                  </Text>
                )}
              </Group>
              <Divider />
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
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// PotsPage
// ---------------------------------------------------------------------------

export function PotsPage() {
  const categoriesQuery = trpc.categories.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()
  const usedIdsQuery = trpc.pots.usedIds.useQuery()
  const setAsidesQuery = trpc.setAside.list.useQuery()

  const categories = categoriesQuery.data ?? []
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const usedIds = new Set(usedIdsQuery.data ?? [])

  const money = useMoney()

  const setAsidesByPot = new Map<string, SetAside[]>()
  for (const s of setAsidesQuery.data ?? []) {
    const arr = setAsidesByPot.get(s.potId) ?? []
    arr.push(s)
    setAsidesByPot.set(s.potId, arr)
  }
  for (const arr of setAsidesByPot.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder)

  const [formOpened, setFormOpened] = useState(false)

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Pots</Title>
          <Text size="sm" c="dimmed">
            Buckets you split your money into. Each pot's monthly contribution is set here.
          </Text>
        </div>
        <Button onClick={() => setFormOpened(true)} style={{ flexShrink: 0 }}>
          Add pot
        </Button>
      </Group>
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
      {formOpened && (
        <PotFormModal opened={formOpened} onClose={() => setFormOpened(false)} members={members} categories={categories} money={money} />
      )}
    </Stack>
  )
}
