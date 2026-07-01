import { Badge, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { trpc } from '../trpc'

export function HomePage() {
  const ctx = trpc.bootstrap.context.useQuery()

  if (ctx.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  const household = ctx.data?.household
  const members = ctx.data?.members ?? []
  const activeMembers = members.filter((m) => m.archivedAt === null)

  return (
    <Stack gap="lg" maw={600} mx="auto" mt="xl">
      <Title order={2}>{household?.displayName ?? 'Household'}</Title>
      <Group gap="sm" wrap="wrap">
        {activeMembers.map((m) => (
          <Badge
            key={m.id}
            size="lg"
            variant="light"
            color={m.color ?? undefined}
            style={
              m.color
                ? {
                    backgroundColor: m.color + '22',
                    color: m.color,
                    borderColor: m.color + '55',
                  }
                : undefined
            }
          >
            {m.displayName}
            {m.kind === 'joint' ? ' (joint)' : ''}
          </Badge>
        ))}
      </Group>
      <Text c="dimmed" size="sm">
        Your budget setup is ready — pots, outgoings and spending are coming next.
      </Text>
    </Stack>
  )
}
