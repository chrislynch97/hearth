import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Collapse,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { formatMoney, fromMinor, toMinor } from '../../shared/money'
import { subtractMonths } from '../../shared/dates'
import { useMoney, useFormatDate } from '../useMoney'
import type { MoneyFormat } from '../useMoney'
import { hearthTokens, chartXAxisProps } from '../theme'
import type { Member, PayslipComponentType } from '../../server/db/schema'
import type { PayslipWithLines } from '../../server/routers/payslips'
import { normalizeComponentDraft } from './payslipDraft'
import type { ComponentKind } from './payslipDraft'

const KIND_OPTIONS = [
  { value: 'earning', label: 'Earning' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'employer_info', label: 'Employer info' },
]

// ---------------------------------------------------------------------------
// Component management
// ---------------------------------------------------------------------------

export function ComponentManager({ ownerId, components }: { ownerId: string; components: PayslipComponentType[] }) {
  const utils = trpc.useUtils()
  const create = trpc.payslipComponents.create.useMutation()
  const update = trpc.payslipComponents.update.useMutation()
  const archive = trpc.payslipComponents.archive.useMutation()

  const [name, setName] = useState('')
  const [kind, setKind] = useState<ComponentKind>('earning')
  const [isVariable, setIsVariable] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editKind, setEditKind] = useState<ComponentKind>('earning')
  const [editIsVariable, setEditIsVariable] = useState(false)

  async function invalidate() {
    await Promise.all([utils.payslipComponents.list.invalidate(), utils.income.overview.invalidate()])
  }

  function startEdit(c: PayslipComponentType) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditKind(c.kind as ComponentKind)
    setEditIsVariable(c.isVariable === 1)
  }

  async function handleSaveEdit(id: string) {
    const draft = normalizeComponentDraft({ name: editName, kind: editKind, isVariable: editIsVariable })
    if (!draft) return // empty name — leave the editor open
    await update.mutateAsync({ id, ...draft })
    await invalidate()
    setEditingId(null)
  }

  async function handleAdd() {
    const draft = normalizeComponentDraft({ name, kind, isVariable })
    if (!draft) return setError('Enter a component name.')
    setError('')
    await create.mutateAsync({ ownerId, ...draft })
    await invalidate()
    setName('')
    setIsVariable(false)
  }

  return (
    <Stack gap="sm">
      <Stack gap={2}>
        {components.map((c) => (
          <Group key={c.id} justify="space-between" px="xs" py={4} wrap="nowrap">
            {editingId === c.id ? (
              <Group gap="xs" style={{ flex: 1 }} wrap="nowrap" role="group" aria-label="Edit component">
                <TextInput
                  size="xs"
                  aria-label="Component name"
                  value={editName}
                  onChange={(e) => setEditName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveEdit(c.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <Select
                  size="xs"
                  aria-label="Component type"
                  data={KIND_OPTIONS}
                  value={editKind}
                  onChange={(v) => {
                    const next = (v as ComponentKind) ?? 'earning'
                    setEditKind(next)
                    if (next !== 'earning') setEditIsVariable(false)
                  }}
                  allowDeselect={false}
                  w={130}
                />
                {editKind === 'earning' && (
                  <Switch
                    size="xs"
                    label="Variable"
                    checked={editIsVariable}
                    onChange={(e) => setEditIsVariable(e.currentTarget.checked)}
                  />
                )}
                <Button size="xs" onClick={() => void handleSaveEdit(c.id)} loading={update.isPending}>
                  Save
                </Button>
                <Button size="xs" variant="subtle" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </Group>
            ) : (
              <>
                <Group gap="xs">
                  <Text size="sm">{c.name}</Text>
                  <Badge size="xs" variant="light" color={c.kind === 'deduction' ? 'apricot' : c.kind === 'employer_info' ? 'gray' : 'moss'}>
                    {c.kind === 'employer_info' ? 'employer' : c.kind}
                  </Badge>
                  {c.isVariable === 1 && c.kind === 'earning' && (
                    <Badge size="xs" variant="outline" color="gray">
                      variable
                    </Badge>
                  )}
                </Group>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => startEdit(c)}
                  >
                    ✎
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={`Remove ${c.name}`}
                    onClick={async () => {
                      await archive.mutateAsync({ id: c.id })
                      await invalidate()
                    }}
                  >
                    ×
                  </ActionIcon>
                </Group>
              </>
            )}
          </Group>
        ))}
        {components.length === 0 && (
          <Text size="sm" c="dimmed">
            No components yet. Add the earnings and deductions that appear on this person's payslip.
          </Text>
        )}
      </Stack>
      <Divider label="Add component" labelPosition="left" />
      <Group align="flex-end">
        <TextInput
          label="Name"
          placeholder="e.g. Basic Pay"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          label="Type"
          data={KIND_OPTIONS}
          value={kind}
          onChange={(v) => {
            const next = (v as typeof kind) ?? 'earning'
            setKind(next)
            if (next !== 'earning') setIsVariable(false)
          }}
          allowDeselect={false}
          w={150}
        />
        {kind === 'earning' && (
          <Switch
            label="Variable"
            checked={isVariable}
            onChange={(e) => setIsVariable(e.currentTarget.checked)}
            mb={8}
          />
        )}
        <Button onClick={() => void handleAdd()} loading={create.isPending}>
          Add
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Mark an earning <strong>Variable</strong> if it changes month to month — a bonus or overtime.
        Variable earnings are left out of your regular monthly income so a one-off doesn't inflate it.
      </Text>
      {(error || create.error) && (
        <Alert color="red" title="Error">
          {error || create.error?.message}
        </Alert>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Payslip entry
// ---------------------------------------------------------------------------

interface PayslipModalProps {
  opened: boolean
  onClose: () => void
  ownerId: string
  components: PayslipComponentType[]
  lastPayslip: PayslipWithLines | null
  payslip: PayslipWithLines | null
  money: MoneyFormat
}

function PayslipModal({ opened, onClose, ownerId, components, lastPayslip, payslip, money }: PayslipModalProps) {
  const utils = trpc.useUtils()
  const create = trpc.payslips.create.useMutation()
  const update = trpc.payslips.update.useMutation()
  const isEditing = payslip !== null

  // Seed amounts: editing → this payslip's lines; adding → carry stable lines from
  // the last payslip, zero the variable ones (spec §5.4).
  const [amounts, setAmounts] = useState<Record<string, number | string>>(() => {
    const seed: Record<string, number | string> = {}
    for (const c of components) {
      let minor: number | null = null
      if (payslip) {
        minor = payslip.lines.find((l) => l.componentId === c.id)?.amount ?? null
      } else if (lastPayslip && c.isVariable === 0) {
        minor = lastPayslip.lines.find((l) => l.componentId === c.id)?.amount ?? null
      }
      seed[c.id] = minor === null ? '' : fromMinor(minor, money.decimalPlaces)
    }
    return seed
  })
  const [payDate, setPayDate] = useState(payslip?.payDate ?? '')
  const [periodLabel, setPeriodLabel] = useState(payslip?.periodLabel ?? '')
  const [netOverride, setNetOverride] = useState<number | string>(
    payslip?.netPay != null ? fromMinor(payslip.netPay, money.decimalPlaces) : '',
  )
  const [error, setError] = useState('')

  const earnings = components.filter((c) => c.kind === 'earning')
  const deductions = components.filter((c) => c.kind === 'deduction')
  const employerInfo = components.filter((c) => c.kind === 'employer_info')

  const minorOf = (c: PayslipComponentType) => {
    const v = amounts[c.id]
    return v === '' || v === undefined ? 0 : toMinor(Number(v), money.decimalPlaces)
  }
  const gross = earnings.reduce((acc, c) => acc + minorOf(c), 0)
  const totalDeductions = deductions.reduce((acc, c) => acc + minorOf(c), 0)
  const computedNet = gross - totalDeductions
  const overrideMinor = netOverride === '' ? null : toMinor(Number(netOverride), money.decimalPlaces)
  const delta = overrideMinor === null ? 0 : overrideMinor - computedNet

  async function handleSubmit() {
    if (!payDate) return setError('Choose a pay date.')
    setError('')
    const lines = components
      .map((c) => ({ componentId: c.id, amount: minorOf(c) }))
      .filter((l) => l.amount !== 0)
    const payload = {
      payDate,
      periodLabel: periodLabel.trim() || undefined,
      netPay: overrideMinor,
      lines,
    }
    if (isEditing) await update.mutateAsync({ id: payslip.id, ...payload })
    else await create.mutateAsync({ ownerId, ...payload })
    await Promise.all([utils.payslips.list.invalidate(), utils.income.overview.invalidate()])
    onClose()
  }

  function field(c: PayslipComponentType) {
    return (
      <NumberInput
        key={c.id}
        label={c.name}
        size="xs"
        placeholder="0.00"
        decimalScale={money.decimalPlaces}
        fixedDecimalScale
        min={0}
        value={amounts[c.id] ?? ''}
        onChange={(v) => setAmounts((a) => ({ ...a, [c.id]: v }))}
      />
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit payslip' : 'Add payslip'} size="lg">
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Pay date" type="date" value={payDate} onChange={(e) => setPayDate(e.currentTarget.value)} />
          <TextInput
            label="Period label (optional)"
            placeholder="e.g. October 2026"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.currentTarget.value)}
          />
        </Group>

        {earnings.length > 0 && (
          <>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Earnings
            </Text>
            <Group grow>{earnings.map(field)}</Group>
          </>
        )}
        {deductions.length > 0 && (
          <>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Deductions
            </Text>
            <Group grow>{deductions.map(field)}</Group>
          </>
        )}
        {employerInfo.length > 0 && (
          <>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Employer info (not counted)
            </Text>
            <Group grow>{employerInfo.map(field)}</Group>
          </>
        )}

        <Card withBorder padding="sm" bg="light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Gross
            </Text>
            <Text size="sm">{formatMoney(gross, money)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Deductions
            </Text>
            <Text size="sm">{formatMoney(totalDeductions, money)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" fw={700}>
              Computed net
            </Text>
            <Text size="sm" fw={700}>
              {formatMoney(computedNet, money)}
            </Text>
          </Group>
        </Card>

        <Group align="flex-end" gap="sm">
          <NumberInput
            label="Actual net pay (optional override)"
            placeholder="0.00"
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            value={netOverride}
            onChange={setNetOverride}
            style={{ flex: 1 }}
          />
          {overrideMinor !== null && (
            <Badge color={delta === 0 ? 'moss' : 'apricot'} variant="light" mb={8}>
              {delta === 0 ? '✓ matches' : `${delta > 0 ? '+' : ''}${formatMoney(delta, money)} vs computed`}
            </Badge>
          )}
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
          <Button onClick={() => void handleSubmit()} loading={create.isPending || update.isPending}>
            {isEditing ? 'Save' : 'Add payslip'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Net-pay trend
// ---------------------------------------------------------------------------

const TREND_RANGES = [
  { value: '12', label: '1y' },
  { value: '24', label: '2y' },
  { value: '60', label: '5y' },
  { value: 'all', label: 'All' },
] as const

function NetTrendCard({ payslips, money }: { payslips: PayslipWithLines[]; money: MoneyFormat }) {
  const allChronological = [...payslips].sort((a, b) => a.payDate.localeCompare(b.payDate))
  const [range, setRange] = useState<string>('24')

  if (allChronological.length < 2) return null

  // Cap how many bars we render — six years of monthly payslips is unreadable.
  // Show the most recent N; the full table below still lists every payslip.
  // Only offer ranges that would actually hide something, and fall back to
  // "All" when the chosen range no longer fits the data.
  const rangeOptions = TREND_RANGES.filter(
    (r) => r.value === 'all' || Number(r.value) < allChronological.length,
  )
  const activeRange = rangeOptions.some((r) => r.value === range) ? range : 'all'
  const limit = activeRange === 'all' ? allChronological.length : Number(activeRange)
  const chronological = allChronological.slice(-limit)

  // One bar per payslip. Variable-pay months (bonus / overtime) render in
  // apricot via a second stacked series that's zero the rest of the time, so
  // each month shows a single full-width bar in the right colour.
  const data = chronological.map((p) => ({
    label: p.periodLabel || p.payDate.slice(0, 7),
    net: p.hasVariablePay ? 0 : p.totals.effectiveNet,
    netVariable: p.hasVariablePay ? p.totals.effectiveNet : 0,
  }))

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Title order={4}>Net pay over time</Title>
        {rangeOptions.length > 1 && (
          <SegmentedControl size="xs" value={activeRange} onChange={setRange} data={[...rangeOptions]} />
        )}
      </Group>
      <BarChart
        h={240}
        data={data}
        dataKey="label"
        type="stacked"
        withLegend
        series={[
          { name: 'net', label: 'Net pay', color: hearthTokens.brand.moss },
          { name: 'netVariable', label: 'Incl. variable', color: hearthTokens.brand.apricot },
        ]}
        valueFormatter={(v) => formatMoney(v, money)}
        yAxisProps={{ width: 76 }}
        xAxisProps={chartXAxisProps}
        gridAxis="y"
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PayslipsPage
// ---------------------------------------------------------------------------

export function PayslipsPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const membersQuery = trpc.members.list.useQuery()
  const persons = (membersQuery.data ?? []).filter((m) => m.archivedAt === null && m.kind === 'person')

  const [ownerId, setOwnerId] = useState<string | null>(null)
  const activeOwner = ownerId ?? persons[0]?.id ?? null

  const componentsQuery = trpc.payslipComponents.list.useQuery(
    { ownerId: activeOwner ?? '' },
    { enabled: !!activeOwner },
  )
  const payslipsQuery = trpc.payslips.list.useQuery({ ownerId: activeOwner ?? '' }, { enabled: !!activeOwner })

  const components = componentsQuery.data ?? []
  const payslips = payslipsQuery.data ?? [] // newest-first from the server

  const [showComponents, setShowComponents] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PayslipWithLines | null>(null)

  const utils = trpc.useUtils()
  const remove = trpc.payslips.remove.useMutation()

  // Running total (all-time to date) and rolling-12m net, computed from the list.
  const derived = useMemo(() => {
    const asc = [...payslips].sort((a, b) => a.payDate.localeCompare(b.payDate))
    const byId = new Map<string, { running: number; rolling: number }>()
    for (const p of asc) {
      const from = subtractMonths(p.payDate, 12)
      const running = asc
        .filter((x) => x.payDate <= p.payDate)
        .reduce((acc, x) => acc + x.totals.effectiveNet, 0)
      const rolling = asc
        .filter((x) => x.payDate > from && x.payDate <= p.payDate)
        .reduce((acc, x) => acc + x.totals.effectiveNet, 0)
      byId.set(p.id, { running, rolling })
    }
    return byId
  }, [payslips])

  async function handleDelete(id: string) {
    await remove.mutateAsync({ id })
    await Promise.all([utils.payslips.list.invalidate(), utils.income.overview.invalidate()])
  }

  const lastPayslip = payslips[0] ?? null // list is newest-first

  return (
    <Stack gap="lg" maw={1000} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Payslips</Title>
        {activeOwner && components.length > 0 && (
          <Button
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
          >
            + Add payslip
          </Button>
        )}
      </Group>

      {persons.length === 0 && <Text c="dimmed">Add people to your household to record payslips.</Text>}

      {persons.length > 1 && (
        <SegmentedControl
          value={activeOwner ?? undefined}
          onChange={setOwnerId}
          data={persons.map((p: Member) => ({ value: p.id, label: p.displayName }))}
        />
      )}

      {activeOwner && (
        <Card withBorder padding="md">
          <Group justify="space-between" align="center" onClick={() => setShowComponents((s) => !s)} style={{ cursor: 'pointer' }}>
            <Title order={4}>Payslip components</Title>
            <Text size="sm" c="dimmed">
              {components.length} defined — {showComponents ? 'hide' : 'edit'}
            </Text>
          </Group>
          <Collapse expanded={showComponents || components.length === 0}>
            <Stack gap="sm" mt="sm">
              <ComponentManager ownerId={activeOwner} components={components} />
            </Stack>
          </Collapse>
        </Card>
      )}

      {payslipsQuery.isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {activeOwner && !payslipsQuery.isLoading && payslips.length === 0 && components.length > 0 && (
        <Text c="dimmed">No payslips yet. Use “Add payslip” to record one.</Text>
      )}

      {payslips.length > 0 && <NetTrendCard payslips={payslips} money={money} />}

      {payslips.length > 0 && (
        <Card withBorder padding="md">
          <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>Pay date</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Gross</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Deductions</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Net</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Rolling 12m</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Running total</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {payslips.map((p) => {
                const d = derived.get(p.id)
                return (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" style={{ whiteSpace: 'nowrap' }}>{p.periodLabel || fmt(p.payDate)}</Text>
                        {p.hasVariablePay && (
                          <Badge size="xs" variant="light" color="apricot">
                            variable
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatMoney(p.totals.grossPay, money)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatMoney(p.totals.totalDeductions, money)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="sm" fw={600}>
                        {formatMoney(p.totals.effectiveNet, money)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} c="dimmed">
                      {d ? formatMoney(d.rolling, money) : '—'}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }} c="dimmed">
                      {d ? formatMoney(d.running, money) : '—'}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label="Edit payslip"
                          onClick={() => {
                            setEditing(p)
                            setModalOpen(true)
                          }}
                        >
                          ✎
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          aria-label="Delete payslip"
                          onClick={() => void handleDelete(p.id)}
                        >
                          ×
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      {activeOwner && modalOpen && (
        <PayslipModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          ownerId={activeOwner}
          components={components}
          lastPayslip={lastPayslip}
          payslip={editing}
          money={money}
        />
      )}
    </Stack>
  )
}
