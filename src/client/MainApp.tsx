import { Badge, Group, Stack, Text, Title } from '@mantine/core'
import type { Household, Member } from '../server/db/schema'

interface MainAppProps {
  household: Household
  members: Member[]
}

export function MainApp({ household, members }: MainAppProps) {
  const activeMembers = members.filter((m) => m.archivedAt === null)

  return (
    <Stack gap="lg" maw={600} mx="auto" mt="xl">
      <Title order={2}>{household.displayName}</Title>
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
