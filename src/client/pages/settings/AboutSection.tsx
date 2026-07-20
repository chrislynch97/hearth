import { Card, Table, Text, Title } from "@mantine/core";
import { trpc } from "@/trpc";

export const AboutSection = () => {
    const statsQuery = trpc.data.stats.useQuery();
    const stats = statsQuery.data;
    if (!stats) return null;
    const entries = Object.entries(stats.counts).filter(([, n]) => n > 0);
    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                About
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
                Database: {stats.databaseLabel}
            </Text>
            <Table verticalSpacing={4}>
                <Table.Tbody>
                    {entries.map(([name, count]) => (
                        <Table.Tr key={name}>
                            <Table.Td>{name}</Table.Td>
                            <Table.Td ta="right">{count}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Card>
    );
};
