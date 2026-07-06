import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { trpc } from './trpc'
import { formatMoney, toMinor } from '../shared/money'
import { useMoney } from './useMoney'

const LAST_OWNER_KEY = 'hearth:lastOwner'

/** Global "quick add spend" modal (opened by the `n` shortcut). Reuses the pot
 *  suggestion engine and stays open after logging for rapid entry. */
export function QuickAddSpend({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const money = useMoney()
  const utils = trpc.useUtils()
  const membersQuery = trpc.members.list.useQuery(undefined, { enabled: opened })
  const potsQuery = trpc.pots.list.useQuery(undefined, { enabled: opened })
  const add = trpc.spends.add.useMutation()

  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const pots = potsQuery.data ?? []
  const persons = members.filter((m) => m.kind === 'person')
  const ordered = [...persons, ...members.filter((m) => m.kind === 'joint')]

  const [amountMajor, setAmountMajor] = useState<number | string>('')
  const [kind, setKind] = useState<'spend' | 'refund'>('spend')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [potId, setPotId] = useState<string | null>(null)
  const [potManuallyChosen, setPotManuallyChosen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  // Default owner to the last-used one (or the first person) once members load.
  useEffect(() => {
    if (ownerId || ordered.length === 0) return
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_OWNER_KEY) : null
    setOwnerId(last && ordered.some((m) => m.id === last) ? last : ordered[0]?.id ?? null)
  }, [ordered, ownerId])

  const suggestQuery = trpc.spends.suggestPot.useQuery(
    { description: description.trim(), ownerId: ownerId ?? '' },
    { enabled: opened && description.trim().length > 0 && !!ownerId },
  )
  useEffect(() => {
    if (potManuallyChosen) return
    if (suggestQuery.data?.potId) setPotId(suggestQuery.data.potId)
  }, [suggestQuery.data, potManuallyChosen])

  const potById = new Map(pots.map((p) => [p.id, p]))

  async function handleSubmit() {
    const desc = description.trim()
    if (!desc) return setError('Enter a description.')
    if (!ownerId) return setError('Choose who this is for.')
    const value = Number(amountMajor)
    if (amountMajor === '' || Number.isNaN(value) || value <= 0) return setError('Enter an amount.')
    setError('')

    const minor = toMinor(value, money.decimalPlaces)
    const inserted = await add.mutateAsync({
      description: desc,
      amount: kind === 'refund' ? -minor : minor,
      ownerId,
      potId: potId || null,
    })
    await Promise.all([
      utils.spends.list.invalidate(),
      utils.reconcile.backlog.invalidate(),
      utils.dashboard.summary.invalidate(),
    ])
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_OWNER_KEY, ownerId)

    const potName = inserted.potId ? potById.get(inserted.potId)?.name : null
    setSuccess(`Logged ${formatMoney(Math.abs(inserted.amount), money)}${potName ? ` — take from ${potName}` : ' — needs a pot'}`)

    // Reset for the next entry, keep the owner, refocus the amount.
    setAmountMajor('')
    setKind('spend')
    setDescription('')
    setPotId(null)
    setPotManuallyChosen(false)
    amountRef.current?.focus()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Quick add spend" size="md">
      <Stack gap="sm">
        <Group grow>
          <NumberInput
            ref={amountRef}
            label="Amount"
            placeholder="0.00"
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            value={amountMajor}
            onChange={(v) => {
              setAmountMajor(v)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            autoFocus
          />
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as 'spend' | 'refund')}
            data={[
              { value: 'spend', label: 'Spend' },
              { value: 'refund', label: 'Refund' },
            ]}
          />
        </Group>
        <TextInput
          label="Description"
          placeholder="e.g. Tesco"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
        <Group grow>
          <Select
            label="Who"
            data={ordered.map((m) => ({ value: m.id, label: m.displayName }))}
            value={ownerId}
            onChange={setOwnerId}
            allowDeselect={false}
          />
          <Select
            label="Pot"
            placeholder="Suggested / assign later"
            data={pots.map((p) => ({ value: p.id, label: p.name }))}
            value={potId}
            searchable
            clearable
            onChange={(v) => {
              setPotId(v)
              setPotManuallyChosen(true)
            }}
          />
        </Group>
        {error && (
          <Alert color="red" title="Error" py={6}>
            {error}
          </Alert>
        )}
        {success && (
          <Text size="sm" c="moss">
            {success}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void handleSubmit()} loading={add.isPending}>
            Log spend
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
