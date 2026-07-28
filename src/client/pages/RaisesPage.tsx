import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { LineChart } from '@mantine/charts'
import { trpc } from '../trpc'
import { formatMoney, fromMinor, toMinor } from '../../shared/money'
import { useMoney, useFormatDate, formatSignedPercent } from '../useMoney'
import type { MoneyFormat } from '../useMoney'
import { hearthTokens, chartXAxisProps } from '../theme'
import type { Member } from '../../server/db/schema'
import type { RaiseWithIncrease } from '../../server/features/income/raises.router'

// ---------------------------------------------------------------------------
// Salary-over-time chart
// ---------------------------------------------------------------------------

function SalaryTrendCard({
  raises,
  money,
  fmt,
}: {
  raises: RaiseWithIncrease[] // chronological (oldest first)
  money: MoneyFormat
  fmt: (date: string) => string
}) {
  if (raises.length < 2) return null
  const data = raises.map((r) => ({ date: fmt(r.effectiveDate), salary: r.newSalary }))

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="md">
        Salary over time
      </Title>
      <LineChart
        h={240}
        data={data}
        dataKey="date"
        // Salary holds steady between raises, so step the line at each change.
        curveType="stepAfter"
        withDots
        series={[{ name: 'salary', label: 'Annual salary', color: hearthTokens.brand.moss }]}
        valueFormatter={(v) => formatMoney(v, money)}
        yAxisProps={{ width: 76 }}
        xAxisProps={chartXAxisProps}
        gridAxis="xy"
      />
    </Card>
  )
}

interface RaiseModalProps {
  opened: boolean
  onClose: () => void
  ownerId: string
  raise: RaiseWithIncrease | null
}

function RaiseModal({ opened, onClose, ownerId, raise }: RaiseModalProps) {
  const money = useMoney()
  const utils = trpc.useUtils()
  const create = trpc.raises.create.useMutation()
  const update = trpc.raises.update.useMutation()
  const isEditing = raise !== null

  const [effectiveDate, setEffectiveDate] = useState(raise?.effectiveDate ?? '')
  const [salaryMajor, setSalaryMajor] = useState<number | string>(
    raise ? fromMinor(raise.newSalary, money.decimalPlaces) : '',
  )
  const [bonusMajor, setBonusMajor] = useState<number | string>(
    raise?.bonus != null ? fromMinor(raise.bonus, money.decimalPlaces) : '',
  )
  const [newPosition, setNewPosition] = useState(raise?.newPosition ?? '')
  const [note, setNote] = useState(raise?.note ?? '')
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!effectiveDate) return setError('Choose an effective date.')
    if (salaryMajor === '' || Number(salaryMajor) <= 0) return setError('Enter the new salary.')
    setError('')
    const payload = {
      effectiveDate,
      newSalary: toMinor(Number(salaryMajor), money.decimalPlaces),
      bonus: bonusMajor === '' ? null : toMinor(Number(bonusMajor), money.decimalPlaces),
      newPosition: newPosition.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (isEditing) await update.mutateAsync({ id: raise.id, expectedUpdatedAt: raise.updatedAt, ...payload })
    else await create.mutateAsync({ ownerId, ...payload })
    await utils.raises.list.invalidate()
    await utils.income.overview.invalidate()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEditing ? 'Edit raise' : 'Add raise'} size="md">
      <Stack
        gap="sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleSubmit()
          }
        }}
      >
        <TextInput
          label="Effective date"
          type="date"
          data-autofocus
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.currentTarget.value)}
        />
        <NumberInput
          label="New salary (annual)"
          placeholder="0.00"
          decimalScale={money.decimalPlaces}
          fixedDecimalScale
          min={0}
          value={salaryMajor}
          onChange={setSalaryMajor}
        />
        <NumberInput
          label="Bonus (optional)"
          placeholder="0.00"
          decimalScale={money.decimalPlaces}
          fixedDecimalScale
          min={0}
          value={bonusMajor}
          onChange={setBonusMajor}
        />
        <TextInput
          label="Position (optional)"
          placeholder="e.g. Senior Engineer"
          value={newPosition}
          onChange={(e) => setNewPosition(e.currentTarget.value)}
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
            {isEditing ? 'Save' : 'Add raise'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export function RaisesPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const membersQuery = trpc.members.list.useQuery()
  const persons = (membersQuery.data ?? []).filter((m) => m.archivedAt === null && m.kind === 'person')

  const [ownerId, setOwnerId] = useState<string | null>(null)
  const activeOwner = ownerId ?? persons[0]?.id ?? null

  const raisesQuery = trpc.raises.list.useQuery(
    { ownerId: activeOwner ?? '' },
    { enabled: !!activeOwner },
  )
  const raises = [...(raisesQuery.data ?? [])].reverse() // newest first for display

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RaiseWithIncrease | null>(null)
  const utils = trpc.useUtils()
  const remove = trpc.raises.remove.useMutation()

  async function handleDelete(id: string) {
    await remove.mutateAsync({ id })
    await utils.raises.list.invalidate()
    await utils.income.overview.invalidate()
  }

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(r: RaiseWithIncrease) {
    setEditing(r)
    setModalOpen(true)
  }

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Raises</Title>
        {activeOwner && <Button onClick={openAdd}>+ Add raise</Button>}
      </Group>

      {persons.length === 0 && <Text c="dimmed">Add people to your household to record raises.</Text>}

      {persons.length > 1 && (
        <SegmentedControl
          value={activeOwner ?? undefined}
          onChange={setOwnerId}
          data={persons.map((p: Member) => ({ value: p.id, label: p.displayName }))}
        />
      )}

      {raisesQuery.isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {activeOwner && !raisesQuery.isLoading && raises.length === 0 && (
        <Text c="dimmed">No raises recorded yet. Add the starting salary as the first entry.</Text>
      )}

      <SalaryTrendCard raises={raisesQuery.data ?? []} money={money} fmt={fmt} />

      {raises.length > 0 && (
        <Card withBorder padding="md">
          <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>Effective</Table.Th>
                <Table.Th>Salary</Table.Th>
                <Table.Th>Increase</Table.Th>
                <Table.Th>Position</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Bonus</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {raises.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmt(r.effectiveDate)}</Table.Td>
                  <Table.Td>{formatMoney(r.newSalary, money)}</Table.Td>
                  <Table.Td>
                    {r.percentIncrease === null ? '—' : formatSignedPercent(r.percentIncrease)}
                  </Table.Td>
                  <Table.Td>{r.newPosition ?? '—'}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {r.bonus != null ? formatMoney(r.bonus, money) : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" size="sm" aria-label="Edit raise" onClick={() => openEdit(r)}>
                        ✎
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        aria-label="Delete raise"
                        onClick={() => void handleDelete(r.id)}
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
        </Card>
      )}

      {activeOwner && modalOpen && (
        <RaiseModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          ownerId={activeOwner}
          raise={editing}
        />
      )}
    </Stack>
  )
}
