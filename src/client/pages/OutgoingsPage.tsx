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
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Category, Expense, Member, Pot } from '../../server/db/schema'
import { fromMinor, formatMoney, toMinor } from '../../shared/money'
import { normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { addMonths, todayIso } from '../../shared/dates'
import { useMoney, useFormatDate, type MoneyFormat } from '../useMoney'
import { groupedPotOptions, orderMembers } from '../potOptions'

type ExpenseRecurrence = 'monthly' | 'quarterly' | 'yearly'
type Funding = 'pot_manual' | 'pot_auto' | 'main'

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const FUNDING_OPTIONS = [
  { value: 'pot_manual', label: 'From a pot' },
  { value: 'pot_auto', label: 'From a pot (auto)' },
  { value: 'main', label: 'Main account' },
]

const FUNDING_HINT: Record<Funding, string> = {
  pot_manual: 'You move the money out of the pot yourself — this shows up on Catch-up.',
  pot_auto: 'The pot deducts automatically (e.g. a Monzo pot) — no catch-up needed.',
  main: 'Paid straight from the main account under a category — no pot, no catch-up.',
}

const INTERVAL_MONTHS: Record<ExpenseRecurrence, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/** The next occurrence of a due anchor on or after today, stepping by the recurrence interval. */
function nextDueDate(anchor: string, recurrence: ExpenseRecurrence): string {
  const interval = INTERVAL_MONTHS[recurrence]
  const today = todayIso()
  const at = (n: number) => addMonths(anchor, n * interval)
  let n = 0
  while (at(n) > today) n -= 1
  while (at(n) < today) n += 1
  return at(n)
}

// ---------------------------------------------------------------------------
// Add / Edit bill modal
// ---------------------------------------------------------------------------

interface BillFormModalProps {
  opened: boolean
  onClose: () => void
  members: Member[]
  pots: Pot[]
  categories: Category[]
  money: MoneyFormat
  expense: Expense | null
}

function BillFormModal({ opened, onClose, members, pots, categories, money, expense }: BillFormModalProps) {
  const utils = trpc.useUtils()
  const create = trpc.expenses.create.useMutation()
  const update = trpc.expenses.update.useMutation()

  const [name, setName] = useState(expense?.name ?? '')
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>((expense?.recurrence as ExpenseRecurrence) ?? 'monthly')
  const [amountMajor, setAmountMajor] = useState(
    expense?.amount != null ? String(fromMinor(expense.amount, money.decimalPlaces)) : '',
  )
  const [funding, setFunding] = useState<Funding>((expense?.funding as Funding) ?? 'pot_manual')
  const [potId, setPotId] = useState<string | null>(expense?.potId ?? null)
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? null)
  const [note, setNote] = useState(expense?.note ?? '')
  const [dueAnchor, setDueAnchor] = useState(expense?.dueAnchor ?? '')
  const [error, setError] = useState('')

  const isEditing = expense !== null
  const pending = create.isPending || update.isPending
  const isMain = funding === 'main'

  const potGroups = groupedPotOptions(pots, members)
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Please enter a name.')
    if (amountMajor === '' || Number(amountMajor) <= 0) return setError('Please enter an amount.')
    if (isMain && !categoryId) return setError('A main-account bill needs a category.')
    if (!isMain && !potId) return setError('Please choose a pot.')
    setError('')

    const amount = toMinor(Number(amountMajor), money.decimalPlaces)
    const payload = {
      name: trimmed,
      recurrence,
      amount,
      funding,
      potId: isMain ? null : potId,
      categoryId: isMain ? categoryId : null,
      note: note.trim() || undefined,
      dueAnchor: dueAnchor || undefined,
    }

    if (isEditing) await update.mutateAsync({ id: expense.id, expectedUpdatedAt: expense.updatedAt, ...payload })
    else await create.mutateAsync(payload)

    await Promise.all([utils.expenses.list.invalidate(), utils.plan.funding.invalidate()])
    setError('')
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit bill' : 'Add bill'} size="lg">
      <Stack gap="sm">
        <TextInput label="Name" placeholder="e.g. Council tax" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
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
            onChange={(v) => setRecurrence((v as ExpenseRecurrence) ?? 'monthly')}
            allowDeselect={false}
          />
        </Group>

        <Divider label="How is it paid?" labelPosition="left" />
        <SegmentedControl fullWidth data={FUNDING_OPTIONS} value={funding} onChange={(v) => setFunding(v as Funding)} />
        <Text size="xs" c="dimmed">
          {FUNDING_HINT[funding]}
        </Text>
        {isMain ? (
          <Select
            label="Category"
            placeholder="Pick a category"
            data={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            searchable
          />
        ) : (
          <Select
            label="Pot"
            placeholder="Pick a pot"
            data={potGroups}
            value={potId}
            onChange={setPotId}
            searchable
          />
        )}

        <Divider />
        <Group grow>
          <TextInput
            label="Due date (optional)"
            placeholder="YYYY-MM-DD"
            type="date"
            value={dueAnchor}
            onChange={(e) => setDueAnchor(e.currentTarget.value)}
          />
          <TextInput label="Note (optional)" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        </Group>

        {(error || create.error || update.error) && (
          <Alert color="red" title="Error">
            {error || create.error?.message || update.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={pending}>
            {isEditing ? 'Save' : 'Add bill'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Bill row
// ---------------------------------------------------------------------------

function BillRow({
  expense,
  pots,
  categories,
  money,
  onEdit,
  hideTarget = false,
}: {
  expense: Expense
  pots: Pot[]
  categories: Category[]
  money: MoneyFormat
  onEdit: () => void
  hideTarget?: boolean
}) {
  const utils = trpc.useUtils()
  const fmtDate = useFormatDate()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const archive = trpc.expenses.archive.useMutation()

  const potName = expense.potId ? pots.find((p) => p.id === expense.potId)?.name : null
  const categoryName = expense.categoryId ? categories.find((c) => c.id === expense.categoryId)?.name : null
  const monthly = roundMinor(normaliseToMonthly(expense.amount ?? 0, expense.recurrence as Recurrence))

  const funding = (expense.funding ?? 'pot_manual') as Funding
  const target =
    funding === 'main' ? `Main account · ${categoryName ?? 'uncategorised'}` : `→ ${potName ?? 'no pot'}`

  async function handleArchive() {
    await archive.mutateAsync({ id: expense.id })
    await Promise.all([utils.expenses.list.invalidate(), utils.plan.funding.invalidate()])
    setConfirmArchive(false)
  }

  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={4}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600}>{expense.name}</Text>
            <Badge size="sm" variant="light">
              {expense.recurrence}
            </Badge>
            {funding === 'pot_auto' && (
              <Badge size="sm" variant="light" color="teal">
                auto
              </Badge>
            )}
            {funding === 'main' && !hideTarget && (
              <Badge size="sm" variant="light" color="grape">
                main account
              </Badge>
            )}
            {expense.dueAnchor && (
              <Text size="sm" c="dimmed">
                · due {fmtDate(nextDueDate(expense.dueAnchor, expense.recurrence as ExpenseRecurrence))}
              </Text>
            )}
          </Group>
          <Group gap={8} wrap="wrap">
            <Text size="sm">{formatMoney(expense.amount ?? 0, money)}</Text>
            <Text size="xs" c="dimmed">
              {formatMoney(monthly, money)}/mo
            </Text>
            {!hideTarget && (
              <Text size="xs" c="dimmed">
                {target}
              </Text>
            )}
          </Group>
          {expense.note && (
            <Text size="xs" c="dimmed">
              {expense.note}
            </Text>
          )}
        </Stack>
        <Group gap={4}>
          <ActionIcon variant="subtle" size="sm" aria-label={`Edit ${expense.name}`} onClick={onEdit}>
            ✎
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Archive ${expense.name}`} onClick={() => setConfirmArchive(true)}>
            ×
          </ActionIcon>
        </Group>
      </Group>
      <Modal opened={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive bill?" size="sm">
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
// OutgoingsPage (Bills)
// ---------------------------------------------------------------------------

export function OutgoingsPage() {
  const expensesQuery = trpc.expenses.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()
  const categoriesQuery = trpc.categories.list.useQuery()

  const [formOpened, setFormOpened] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  const money = useMoney()

  const expenses = (expensesQuery.data ?? []).filter((e) => e.active === 1)
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const categories = categoriesQuery.data ?? []

  const isLoading = expensesQuery.isLoading || potsQuery.isLoading || membersQuery.isLoading || categoriesQuery.isLoading

  // Group bills by the account they draw from — one card per owner (whoever owns
  // the pot), plus a Main account card — and within each, sub-sections per
  // category. A bill's category is its pot's category (or, for a main-account
  // bill, its own category).
  const potById = new Map(pots.map((p) => [p.id, p]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const orderedCategoryIds = categories.map((c) => c.id)
  const groupMonthly = (bills: Expense[]) =>
    roundMinor(bills.reduce((acc, e) => acc + normaliseToMonthly(e.amount ?? 0, e.recurrence as Recurrence), 0))

  const isMainBill = (e: Expense) => (e.funding ?? 'pot_manual') === 'main' || !e.potId
  const billOwnerKey = (e: Expense) => (isMainBill(e) ? 'main' : potById.get(e.potId!)?.ownerId ?? 'main')
  const billCategoryId = (e: Expense) => (isMainBill(e) ? e.categoryId : potById.get(e.potId!)?.categoryId ?? null)

  interface BillSection { catId: string | null; name: string; bills: Expense[] }
  function sectionsFor(bills: Expense[]): BillSection[] {
    const byCat = new Map<string | null, Expense[]>()
    for (const e of [...bills].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = billCategoryId(e)
      const arr = byCat.get(key) ?? []
      arr.push(e)
      byCat.set(key, arr)
    }
    const out: BillSection[] = []
    for (const catId of orderedCategoryIds) {
      const items = byCat.get(catId)
      if (items?.length) out.push({ catId, name: categoryById.get(catId)?.name ?? '', bills: items })
    }
    const uncat = byCat.get(null)
    if (uncat?.length) out.push({ catId: null, name: 'Uncategorised', bills: uncat })
    return out
  }

  const billsByOwner = new Map<string, Expense[]>()
  for (const e of expenses) {
    const key = billOwnerKey(e)
    const arr = billsByOwner.get(key) ?? []
    arr.push(e)
    billsByOwner.set(key, arr)
  }
  interface OwnerGroup { key: string; label: string; isMain: boolean; color: string | null; sections: BillSection[]; bills: Expense[] }
  const ownerGroups: OwnerGroup[] = []
  for (const owner of orderMembers(members)) {
    const bills = billsByOwner.get(owner.id)
    if (bills?.length) ownerGroups.push({ key: owner.id, label: owner.displayName, isMain: false, color: owner.color, sections: sectionsFor(bills), bills })
  }
  const mainBills = billsByOwner.get('main')
  if (mainBills?.length) ownerGroups.push({ key: 'main', label: 'Main account', isMain: true, color: null, sections: sectionsFor(mainBills), bills: mainBills })

  function openAdd() {
    setEditing(null)
    setFormOpened(true)
  }
  function openEdit(expense: Expense) {
    setEditing(expense)
    setFormOpened(true)
  }

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Bills</Title>
          <Text size="sm" c="dimmed">
            Recurring payments that get spent and reconciled. To set money aside into a pot, use its monthly contribution on the Pots page.
          </Text>
        </div>
        <Button onClick={openAdd} style={{ flexShrink: 0 }}>
          Add bill
        </Button>
      </Group>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && expenses.length === 0 && (
        <Text c="dimmed">No bills yet — add one to start building your funding plan.</Text>
      )}

      <Stack gap="md">
        {ownerGroups.map((g) => (
          <Card key={g.key} withBorder padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <Title order={4}>{g.label}</Title>
                  {!g.isMain && (
                    <Badge size="sm" variant="light" color={g.color ?? 'gray'}>
                      account
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {formatMoney(groupMonthly(g.bills), money)}/mo
                </Text>
              </Group>
              <Divider />
              {g.sections.map((section) => (
                <Stack key={section.catId ?? 'none'} gap={4}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    {section.name}
                  </Text>
                  <Stack gap="sm">
                    {section.bills.map((e, i) => (
                      <div key={e.id}>
                        {i > 0 && <Divider mb="sm" />}
                        <BillRow expense={e} pots={pots} categories={categories} money={money} onEdit={() => openEdit(e)} hideTarget={g.isMain} />
                      </div>
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Card>
        ))}
      </Stack>

      {formOpened && (
        <BillFormModal
          opened={formOpened}
          onClose={() => setFormOpened(false)}
          members={members}
          pots={pots}
          categories={categories}
          money={money}
          expense={editing}
        />
      )}
    </Stack>
  )
}
