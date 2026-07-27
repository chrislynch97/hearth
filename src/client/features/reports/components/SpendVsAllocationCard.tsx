import { Card, Group, Table, Text, Title } from "@mantine/core";
import { Bullet } from "@microcharts/react/bullet";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { moneyFormat } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import type { Report } from "../model";
import { ExportButton } from "./ExportButton";

export interface SpendVsAllocationCardProps {
    report: Report;
    money: MoneyFormat;
    dp: number;
}

export const SpendVsAllocationCard = ({
    report,
    money,
    dp,
}: SpendVsAllocationCardProps) => {
    const rows = report.spendVsAllocation;
    const fmt = moneyFormat(money);

    const exportCsv = () =>
        downloadCsv("spend-vs-allocation.csv", [
            ["Category", "Planned", "Actual", "Difference"],
            ...rows.map((r) => [
                r.name,
                fromMinor(r.planned, dp),
                fromMinor(r.actual, dp),
                fromMinor(r.diff, dp),
            ]),
        ]);

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>Spend vs allocation</Title>
                <ExportButton onClick={exportCsv} />
            </Group>
            {rows.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No allocation or spend yet.
                </Text>
            ) : (
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Category</Table.Th>
                            <Table.Th>Actual vs planned</Table.Th>
                            <Table.Th ta="right">Planned</Table.Th>
                            <Table.Th ta="right">Actual</Table.Th>
                            <Table.Th ta="right">Difference</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((r) => (
                            <Table.Tr key={r.categoryId ?? "uncat"}>
                                <Table.Td>{r.name}</Table.Td>
                                <Table.Td w={130}>
                                    {/* Each row is scaled to its own plan — the question
                                        is "did this category land inside its target?",
                                        not how it compares to other categories. */}
                                    <Bullet
                                        value={r.actual}
                                        target={r.planned}
                                        label="none"
                                        width={110}
                                        height={14}
                                        format={fmt}
                                        title={`${r.name}: spend against plan`}
                                    />
                                </Table.Td>
                                <Table.Td ta="right">
                                    {formatMoney(r.planned, money)}
                                </Table.Td>
                                <Table.Td ta="right">
                                    {formatMoney(r.actual, money)}
                                </Table.Td>
                                <Table.Td
                                    ta="right"
                                    c={r.diff < 0 ? "red" : undefined}
                                >
                                    {formatMoney(r.diff, money)}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
        </Card>
    );
};
