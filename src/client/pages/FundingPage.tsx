import { useState } from 'react'
import { Alert, Badge, Button, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import type { MoneyFormat } from '../useMoney'
import type { PotFunding } from '../../server/plan/funding'

/** The per-person standing orders as plaintext, ready to paste into a bank. */
function buildPlanText(
  perPerson: Array<{
    memberId: string
    displayName: string
    jointContribution: number
    setAside: number
  }>,
  potsByOwner: Map<string, PotFunding[]>,
  jointTotal: number,
  money: MoneyFormat,
): string {
  const lines: string[] = ['Hearth — monthly funding plan', '']
  for (const person of perPerson) {
    lines.push(`${person.displayName}:`)
    for (const p of potsByOwner.get(person.memberId) ?? []) {
      lines.push(`  ${p.name}  ${formatMoney(p.fundingPerMonth, money)}/mo`)
    }
    if (person.jointContribution > 0) {
      lines.push(`  Joint contribution  ${formatMoney(person.jointContribution, money)}/mo`)
    }
    lines.push(`  → Set aside  ${formatMoney(person.setAside, money)}/mo`)
    lines.push('')
  }
  lines.push(`Joint pots total: ${formatMoney(jointTotal, money)}/mo`)
  return lines.join('\n')
}

export function FundingPage() {
  const ctxQuery = trpc.bootstrap.context.useQuery()
  const fundingQuery = trpc.plan.funding.useQuery()
  const membersQuery = trpc.members.list.useQuery()

  const household = ctxQuery.data?.household
  const money = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const isLoading = fundingQuery.isLoading || membersQuery.isLoading
  const plan = fundingQuery.data
  const members = membersQuery.data ?? []
  const memberById = new Map(members.map((m) => [m.id, m]))

  const hasAnything = plan ? plan.perPerson.length > 0 || plan.pots.length > 0 : false

  const potsByOwner = new Map<string, PotFunding[]>()
  if (plan) {
    for (const p of plan.pots) {
      if (p.fundingPerMonth === 0) continue
      const list = potsByOwner.get(p.ownerId) ?? []
      list.push(p)
      potsByOwner.set(p.ownerId, list)
    }
  }

  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    if (!plan) return
    const text = buildPlanText(plan.perPerson, potsByOwner, plan.jointPotFundingTotal, money)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; the plan is still on screen.
    }
  }

  return (
    <Stack gap="lg" maw={900} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>Funding Plan</Title>
        {!isLoading && plan && hasAnything && (
          <Button variant="default" onClick={() => void handleCopy()}>
            {copied ? 'Copied ✓' : 'Copy plan'}
          </Button>
        )}
      </Group>

      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {!isLoading && (!plan || !hasAnything) && (
        <Text c="dimmed">Add outgoings to see your funding plan.</Text>
      )}

      {!isLoading && plan && hasAnything && (
        <>
          <Text size="sm" c="dimmed">
            This is what to set up as standing orders in Monzo (or your bank) each month.
          </Text>

          {plan.unassignedFundingPerMonth > 0 && (
            <Alert color="apricot" title="Unassigned outgoings">
              {formatMoney(plan.unassignedFundingPerMonth, money)} of outgoings isn't assigned to a pot.
            </Alert>
          )}

          <Group grow align="stretch">
            {plan.perPerson.map((person) => (
              <Card key={person.memberId} withBorder padding="md">
                <Stack gap={6}>
                  <Title order={4}>{person.displayName}</Title>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Personal pots
                    </Text>
                    <Text size="sm">{formatMoney(person.personalPotFunding, money)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Joint contribution
                    </Text>
                    <Text size="sm">{formatMoney(person.jointContribution, money)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>
                      Set aside
                    </Text>
                    <Text size="sm" fw={700}>
                      {formatMoney(person.setAside, money)}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Group>

          <Card withBorder padding="md">
            <Group justify="space-between">
              <Text fw={600}>Joint pots total</Text>
              <Text fw={600}>{formatMoney(plan.jointPotFundingTotal, money)}</Text>
            </Group>
          </Card>

          <Card withBorder padding="md">
            <Stack gap="sm">
              <Title order={4}>Standing orders</Title>
              {[...potsByOwner.entries()].map(([ownerId, pots]) => {
                const owner = memberById.get(ownerId)
                return (
                  <Stack key={ownerId} gap={4}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      {owner?.displayName ?? ownerId}
                    </Text>
                    <Stack gap={2}>
                      {pots.map((p) => (
                        <Group key={p.potId} justify="space-between" px="xs" py={4}>
                          <Group gap="xs">
                            <Text size="sm">{p.name}</Text>
                            {p.isDrawdown && (
                              <Badge size="sm" color="sand" variant="light">
                                savings
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm">{formatMoney(p.fundingPerMonth, money)}/mo</Text>
                        </Group>
                      ))}
                    </Stack>
                  </Stack>
                )
              })}
              {potsByOwner.size === 0 && (
                <Text size="sm" c="dimmed">
                  No standing orders needed yet.
                </Text>
              )}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
