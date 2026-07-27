import { Card, Group, SimpleGrid, Table, Text, Title } from "@mantine/core";
import { Delta } from "@microcharts/react/delta";
import { Progress } from "@microcharts/react/progress";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { moneyFormat } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import { monthLabel, type Report } from "../model";
import { ExportButton } from "./ExportButton";
import { Stat } from "./Stat";

export interface MonthlySpendingCardProps {
    report: Report;
    money: MoneyFormat;
    dp: number;
}

export const MonthlySpendingCard = ({
    report,
    money,
    dp,
}: MonthlySpendingCardProps) => {
    const { rows, average, highest, lowest } = report.monthlyTotals;
    const max = Math.max(1, ...rows.map((r) => r.total));
    const fmt = moneyFormat(money);

    const exportCsv = () =>
        downloadCsv("monthly-spending.csv", [
            ["Month", "Total", "Transactions", "Change vs prev"],
            ...rows.map((r) => [
                r.month,
                fromMinor(r.total, dp),
                r.count,
                r.change === null ? "" : fromMinor(r.change, dp),
            ]),
        ]);

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>Monthly spending</Title>
                <ExportButton onClick={exportCsv} />
            </Group>

            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" mb="md">
                <Stat
                    label="Avg / month"
                    value={formatMoney(average, money)}
                    sub="over the window"
                />
                <Stat
                    label="Highest"
                    value={highest ? formatMoney(highest.total, money) : "—"}
                    sub={highest ? monthLabel(highest.month) : undefined}
                />
                <Stat
                    label="Lowest"
                    value={lowest ? formatMoney(lowest.total, money) : "—"}
                    sub={lowest ? monthLabel(lowest.month) : undefined}
                />
            </SimpleGrid>

            {rows.every((r) => r.count === 0) ? (
                <Text size="sm" c="dimmed">
                    No spending in this window.
                </Text>
            ) : (
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Month</Table.Th>
                            <Table.Th />
                            <Table.Th ta="right">Total</Table.Th>
                            <Table.Th ta="right">Transactions</Table.Th>
                            <Table.Th ta="right">Change</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((r) => (
                            <Table.Tr key={r.month}>
                                <Table.Td>{monthLabel(r.month)}</Table.Td>
                                <Table.Td w={110}>
                                    {/* Decorative: the total sits in the next cell. */}
                                    <Progress
                                        value={r.total}
                                        max={max}
                                        label="none"
                                        width={90}
                                        height={8}
                                        summary={false}
                                    />
                                </Table.Td>
                                <Table.Td ta="right">
                                    {r.total === 0
                                        ? "—"
                                        : formatMoney(r.total, money)}
                                </Table.Td>
                                <Table.Td ta="right" c="dimmed">
                                    {r.count}
                                </Table.Td>
                                <Table.Td ta="right">
                                    {r.change === null ? (
                                        <Text size="sm" c="dimmed">
                                            —
                                        </Text>
                                    ) : (
                                        // Spending falling is the good direction.
                                        <Delta
                                            value={r.change}
                                            positive="down"
                                            format={fmt}
                                            title={`${monthLabel(r.month)} vs the month before`}
                                        />
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
        </Card>
    );
};
