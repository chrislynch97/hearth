import { Box, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Progress } from "@microcharts/react/progress";
import { formatMoney } from "@shared/money";
import { shareSummary } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";

export interface AllocationCardProps {
    allocation: {
        perCategory: Array<{
            categoryId: string | null;
            name: string;
            funding: number;
        }>;
        total: number;
    };
    householdIncome: number;
    money: MoneyFormat;
}

export const AllocationCard = ({
    allocation,
    householdIncome,
    money,
}: AllocationCardProps) => {
    if (allocation.perCategory.length === 0) return null;

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Allocation by category
            </Title>
            <Stack gap="xs">
                {allocation.perCategory.map((c) => (
                    <Box key={c.categoryId ?? "uncat"}>
                        <Group justify="space-between" mb={2}>
                            <Text size="sm">{c.name}</Text>
                            <Text size="sm">
                                {formatMoney(c.funding, money)}
                            </Text>
                        </Group>
                        {/* Bars are scaled to income, not to the biggest category:
                            "what share of what we earn does this eat?" is the
                            question this card exists to answer. */}
                        <Progress
                            value={c.funding}
                            max={Math.max(1, householdIncome)}
                            width={200}
                            height={14}
                            title={c.name}
                            summary={shareSummary(
                                c.funding,
                                householdIncome,
                                "household income"
                            )}
                        />
                    </Box>
                ))}
            </Stack>
        </Card>
    );
};
