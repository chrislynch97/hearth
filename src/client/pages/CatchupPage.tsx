import { useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Card, Center, Divider, Group, Loader, NumberInput, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { trpc } from '../trpc'
import type { Member } from '../../server/db/schema'
import { formatMoney, fromMinor, toMinor } from '../../shared/money'
import { useMoney, useFormatDate, type MoneyFormat } from '../useMoney'

interface BacklogSpend {
  id: string
  date: string
  description: string
  amount: number
  ownerId: string
}
interface BacklogPayer {
  ownerId: string
  total: number
  count: number
  residual: number
  spends: BacklogSpend[]
}
interface BacklogPot {
  potId: string
  potName: string
  ownerId: string
  total: number
  count: number
  residual: number
  payers: BacklogPayer[]
}

// ---------------------------------------------------------------------------
// Per-payer sub-row — one "who paid" slice within a pot, expandable to its spends
// ---------------------------------------------------------------------------

function PayerRow({
  potId,
  payer,
  members,
  money,
}: {
  potId: string
  payer: BacklogPayer
  members: Member[]
  money: MoneyFormat
}) {
  const utils = trpc.useUtils()
  const fmtDate = useFormatDate()
  const markMoved = trpc.reconcile.markPotMoved.useMutation()
  const clearResidual = trpc.reconcile.clearResidual.useMutation()
  const [open, setOpen] = useState(false)

  // What still needs moving = spends + any residual carried from earlier part-moves.
  const required = payer.total + payer.residual
  const direction = required < 0 ? -1 : 1
  const hasSpends = payer.count > 0
  // The field holds the magnitude actually moved; sign comes from `direction`.
  const [moved, setMoved] = useState<number | string>(fromMinor(Math.abs(required), money.decimalPlaces))

  const payerMember = members.find((m) => m.id === payer.ownerId)
  const isJoint = payerMember?.kind === 'joint'
  const isPullBack = required < 0

  const invalidate = () =>
    Promise.all([
      utils.reconcile.backlog.invalidate(),
      utils.reconcile.batches.invalidate(),
      utils.spends.list.invalidate(),
    ])

  const handleMove = async () => {
    const magnitude = moved === '' ? 0 : toMinor(Number(moved), money.decimalPlaces)
    await markMoved.mutateAsync({ potId, ownerId: payer.ownerId, movedAmount: direction * magnitude })
    await invalidate()
  }

  const handleClear = async () => {
    await clearResidual.mutateAsync({ potId, ownerId: payer.ownerId })
    await invalidate()
  }

  // "→ Ava" means the money should come back to Ava; joint = it stays in the joint account.
  const arrow = isJoint ? 'stays with Joint' : `→ ${payerMember?.displayName ?? 'someone'}`
  const movedMinor = moved === '' ? 0 : toMinor(Number(moved), money.decimalPlaces)
  const overshoot = hasSpends && movedMinor > Math.abs(required)
  const error = markMoved.error ?? clearResidual.error

  // Residual-only row: no fresh spends, just a shortfall/credit carried over. There
  // are no spends to reconcile, so the only action is to write it off.
  if (!hasSpends) {
    const short = payer.residual > 0
    return (
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={500}>
            {formatMoney(Math.abs(payer.residual), money)} {short ? 'short' : 'credit'} {arrow}
            <Text span size="xs" c="dimmed">
              {' '}
              · carried over
            </Text>
          </Text>
          <Button size="xs" variant="default" onClick={() => void handleClear()} loading={clearResidual.isPending}>
            Clear
          </Button>
        </Group>
        {error && (
          <Alert color="red" title="Error">
            {error.message}
          </Alert>
        )}
      </Stack>
    )
  }

  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setOpen((o) => !o)} aria-label="Toggle spends">
            {open ? '▾' : '▸'}
          </ActionIcon>
          <Text size="sm" fw={500}>
            {isPullBack ? 'Pull back ' : ''}
            {formatMoney(Math.abs(required), money)} {arrow}
          </Text>
          <Text size="xs" c="dimmed">
            {payer.count} spend{payer.count === 1 ? '' : 's'}
            {payer.residual !== 0 &&
              ` · incl. ${formatMoney(Math.abs(payer.residual), money)} ${payer.residual > 0 ? 'carried over' : 'credit'}`}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <NumberInput
            aria-label="Amount moved"
            prefix={money.symbol}
            decimalScale={money.decimalPlaces}
            fixedDecimalScale
            min={0}
            value={moved}
            onChange={setMoved}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleMove()
            }}
            w={110}
            size="xs"
          />
          <Button size="xs" variant="light" onClick={() => void handleMove()} loading={markMoved.isPending}>
            Move
          </Button>
        </Group>
      </Group>
      {overshoot && (
        <Text size="xs" c="dimmed" pl={30}>
          More than needed — the extra {formatMoney(movedMinor - Math.abs(required), money)} becomes a credit next time.
        </Text>
      )}
      {open && (
        <Stack gap={2} pl={30} pb={4}>
          {payer.spends.map((s) => (
            <Group key={s.id} justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed" truncate>
                {fmtDate(s.date)} · {s.description}
              </Text>
              <Text size="xs" c="dimmed">
                {formatMoney(Math.abs(s.amount), money)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
      {error && (
        <Alert color="red" title="Error">
          {error.message}
        </Alert>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Per-pot row — groups its payers
// ---------------------------------------------------------------------------

function PotBacklogRow({ pot, members, money }: { pot: BacklogPot; members: Member[]; money: MoneyFormat }) {
  const owner = members.find((m) => m.id === pot.ownerId)
  const owed = pot.total + pot.residual
  const isPullBack = owed < 0

  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          <Text fw={600}>
            {isPullBack ? 'Pull' : 'Transfer'} {formatMoney(Math.abs(owed), money)}{' '}
            {isPullBack ? 'into' : 'out of'} {pot.potName}
          </Text>
          {owner && (
            <Badge size="sm" variant="light" color={owner.color ?? 'gray'}>
              {owner.displayName}
            </Badge>
          )}
          {pot.payers.length > 1 && (
            <Text size="xs" c="dimmed">
              across {pot.payers.length} people
            </Text>
          )}
        </Group>
        <Divider />
        <Stack gap={6}>
          {pot.payers.map((payer) => (
            <PayerRow key={payer.ownerId} potId={pot.potId} payer={payer} members={members} money={money} />
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistorySection({ money }: { money: MoneyFormat }) {
  const utils = trpc.useUtils()
  const batchesQuery = trpc.reconcile.batches.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const undo = trpc.reconcile.undoBatch.useMutation()

  const batches = batchesQuery.data ?? []
  const pots = potsQuery.data ?? []
  const potById = new Map(pots.map((p) => [p.id, p]))

  async function handleUndo(batchId: string) {
    await undo.mutateAsync({ batchId })
    await Promise.all([
      utils.reconcile.backlog.invalidate(),
      utils.reconcile.batches.invalidate(),
      utils.spends.list.invalidate(),
    ])
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>History</Title>
        {batchesQuery.isLoading && (
          <Center>
            <Loader size="sm" />
          </Center>
        )}
        {!batchesQuery.isLoading && batches.length === 0 && (
          <Text size="sm" c="dimmed">
            No reconciliations yet.
          </Text>
        )}
        <Stack gap="xs">
          {batches.map((b) => {
            const potName = b.potId ? potById.get(b.potId)?.name ?? 'Unknown pot' : 'Mixed'
            const isReversed = b.reversedAt !== null
            const isWriteOff = b.transactionCount === 0
            // A part-move records what actually left the account alongside what was
            // required; the gap is the residual it created or cleared.
            const partial = !isWriteOff && b.movedAmount !== null && b.movedAmount !== b.totalAmount
            return (
              <Group
                key={b.id}
                justify="space-between"
                wrap="wrap"
                px="xs"
                py={6}
                style={{
                  borderRadius: 6,
                  background: 'light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))',
                  opacity: isReversed ? 0.6 : 1,
                }}
              >
                <Group gap="xs" wrap="wrap">
                  <Text
                    size="sm"
                    fw={500}
                    td={isReversed ? 'line-through' : undefined}
                    c={isReversed ? 'dimmed' : undefined}
                  >
                    {potName}
                  </Text>
                  {isWriteOff ? (
                    <Text size="sm" c="dimmed" td={isReversed ? 'line-through' : undefined}>
                      wrote off {formatMoney(Math.abs(b.movedAmount ?? 0), money)}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed" td={isReversed ? 'line-through' : undefined}>
                      {partial
                        ? `moved ${formatMoney(Math.abs(b.movedAmount!), money)} of ${formatMoney(Math.abs(b.totalAmount), money)}`
                        : formatMoney(Math.abs(b.totalAmount), money)}
                    </Text>
                  )}
                  {!isWriteOff && (
                    <Text size="xs" c="dimmed">
                      {b.transactionCount} txn{b.transactionCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {isReversed && (
                    <Badge size="sm" color="sand" variant="light">
                      Reversed
                    </Badge>
                  )}
                </Group>
                {!isReversed && (
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => void handleUndo(b.id)}
                    loading={undo.isPending}
                  >
                    Undo
                  </Button>
                )}
              </Group>
            )
          })}
        </Stack>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CatchupPage
// ---------------------------------------------------------------------------

export function CatchupPage() {
  const membersQuery = trpc.members.list.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()

  const money = useMoney()

  const members = membersQuery.data ?? []
  const backlog = backlogQuery.data

  const isLoading = membersQuery.isLoading || backlogQuery.isLoading

  const hasBacklog = !!backlog && (backlog.perPot.length > 0 || backlog.unassigned.count > 0)

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Title order={2}>Catch-up</Title>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && backlog && (
        <>
          {hasBacklog ? (
            <Alert color="apricot" title="Reconciliation needed">
              You need to move {formatMoney(Math.abs(backlog.grandTotal), money)} across{' '}
              {backlog.perPot.length} pot{backlog.perPot.length === 1 ? '' : 's'}.
            </Alert>
          ) : (
            <Alert color="moss" title="All caught up">
              Nothing to reconcile right now.
            </Alert>
          )}

          {backlog.unassigned.count > 0 && (
            <Card withBorder padding="sm">
              <Group justify="space-between" wrap="wrap">
                <Text size="sm">
                  {backlog.unassigned.count} spend{backlog.unassigned.count === 1 ? '' : 's'} need
                  {backlog.unassigned.count === 1 ? 's' : ''} a pot (
                  {formatMoney(Math.abs(backlog.unassigned.total), money)})
                </Text>
                <Button component={Link} to="/spending" size="xs" variant="light">
                  Assign pots
                </Button>
              </Group>
            </Card>
          )}

          {backlog.perPot.length > 0 && (
            <Stack gap="sm">
              {backlog.perPot.map((p) => (
                <PotBacklogRow key={p.potId} pot={p} members={members} money={money} />
              ))}
            </Stack>
          )}

          <HistorySection money={money} />
        </>
      )}
    </Stack>
  )
}
