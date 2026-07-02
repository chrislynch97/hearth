import { Button, Card, Center, Group, Loader, Stack, Text, Title, useMantineColorScheme } from '@mantine/core'
import { Link } from 'react-router-dom'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { hearthTokens } from '../theme'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const ctx = trpc.bootstrap.context.useQuery()
  const backlogQuery = trpc.reconcile.backlog.useQuery()
  const fundingQuery = trpc.plan.funding.useQuery()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  if (ctx.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  const household = ctx.data?.household
  const members = ctx.data?.members ?? []
  const people = members.filter((m) => m.archivedAt === null && m.kind === 'person')
  const firstPerson = people[0]

  const money = {
    symbol: household?.currencySymbol ?? '£',
    decimalPlaces: household?.currencyDecimalPlaces ?? 2,
    locale: household?.locale ?? 'en-GB',
  }

  const backlog = backlogQuery.data
  const hasBacklog = !!backlog && (backlog.perPot.length > 0 || backlog.unassigned.count > 0)
  const plan = fundingQuery.data

  return (
    <Stack gap="xl" maw={800} mx="auto">
      <Group justify="space-between" align="center">
        <Title order={2}>
          {getGreeting()}, {firstPerson?.displayName ?? 'there'}
        </Title>
        <Button component={Link} to="/spending">
          + Quick add
        </Button>
      </Group>

      {hasBacklog && backlog && (
        <Group
          justify="space-between"
          align="center"
          px="lg"
          py="md"
          style={{
            backgroundColor: `light-dark(${hearthTokens.surface.warmTint}, rgba(217, 140, 95, 0.08))`,
            borderRadius: 'var(--mantine-radius-md)',
            border: `1px solid ${hearthTokens.brand.apricot}44`,
          }}
        >
          <Text size="sm" fw={500}>
            <Text span fw={700} c="apricot">
              {backlog.perPot.length} to reconcile
            </Text>
            {' · move '}
            {formatMoney(Math.abs(backlog.grandTotal), money)}
            {' between pots'}
          </Text>
          <Button component={Link} to="/catchup" size="xs" color={isDark ? hearthTokens.semantic.attention : "dark"} variant="filled">
            Catch-up
          </Button>
        </Group>
      )}

      {plan && plan.perPerson.length > 0 && (
        <Group grow gap="md">
          {plan.perPerson.map((person) => (
            <Card
              key={person.memberId}
              padding="lg"
              radius="lg"
              style={{
                border: '1px solid light-dark(var(--mantine-color-sand-2), var(--mantine-color-dark-4))',
              }}
            >
              <Text size="xs" fw={700} tt="uppercase" mb="xs" c="dimmed" ff="monospace" lts="0.05em">
                {person.displayName}
              </Text>
              <Text
                fw={500}
                fz={32}
                style={{
                  fontFamily: 'var(--mantine-font-family-headings)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatMoney(person.setAside, money)}
              </Text>
            </Card>
          ))}

          <Card
            padding="lg"
            radius="lg"
            style={{
              backgroundColor: hearthTokens.brand.mossDeep,
              border: 'none',
            }}
          >
            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              mb="xs"
              ff="monospace"
              lts="0.05em"
              style={{ color: hearthTokens.brand.apricot }}
            >
              Joint
            </Text>
            <Text
              fw={500}
              fz={32}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                fontVariantNumeric: 'tabular-nums',
                color: hearthTokens.brand.linen,
              }}
            >
              {formatMoney(plan.jointPotFundingTotal, money)}
            </Text>
          </Card>
        </Group>
      )}

      {(!plan || plan.perPerson.length === 0) && !fundingQuery.isLoading && (
        <Text c="dimmed" size="sm">
          Set up your outgoings to see your funding overview here.
        </Text>
      )}
    </Stack>
  )
}
