import { useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Card, Center, Divider, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { trpc } from '../trpc'
import type { Member } from '../../server/db/schema'
import { formatMoney } from '../../shared/money'
import { useFormatDate } from '../useMoney'

interface MoneyFormat {
  symbol: string
  decimalPlaces: number
  locale: string
}

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
  spends: BacklogSpend[]
}
interface BacklogPot {
  potId: string
  potName: string
  ownerId: string
  total: number
  count: number
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
  const [open, setOpen] = useState(false)

  const payerMember = members.find((m) => m.id === payer.ownerId)
  const isJoint = payerMember?.kind === 'joint'
  const isPullBack = payer.total < 0

  async function handleMarkMoved() {
    await markMoved.mutateAsync({ potId, ownerId: payer.ownerId })
    await Promise.all([
      utils.reconcile.backlog.invalidate(),
      utils.reconcile.batches.invalidate(),
      utils.spends.list.invalidate(),
    ])
  }

  // "→ Ava" means the money should come back to Ava; joint = it stays in the joint account.
  const arrow = isJoint ? 'stays with Joint' : `→ ${payerMember?.displayName ?? 'someone'}`

  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setOpen((o) => !o)} aria-label="Toggle spends">
            {open ? '▾' : '▸'}
          </ActionIcon>
          <Text size="sm" fw={500}>
            {isPullBack ? 'Pull back ' : ''}
            {formatMoney(Math.abs(payer.total), money)} {arrow}
          </Text>
          <Text size="xs" c="dimmed">
            {payer.count} spend{payer.count === 1 ? '' : 's'}
          </Text>
        </Group>
        <Button size="xs" variant="light" onClick={() => void handleMarkMoved()} loading={markMoved.isPending}>
          Mark moved
        </Button>
      </Group>
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
      {markMoved.error && (
        <Alert color="red" title="Error">
          {markMoved.error.message}
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
  const isPullBack = pot.total < 0

  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          <Text fw={600}>
            {isPullBack ? 'Pull' : 'Transfer'} {formatMoney(Math.abs(pot.total), money)}{' '}
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
                  <Text size="sm" c="dimmed" td={isReversed ? 'line-through' : undefined}>
                    {formatMoney(Math.abs(b.totalAmount), money)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {b.transactionCount} txn{b.transactionCount === 1 ? '' : 's'}
                  </Text>
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
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const membersQuery = trpc.members.list.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()

  const household = ctxQuery.data?.household
  const money: MoneyFormat = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

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
