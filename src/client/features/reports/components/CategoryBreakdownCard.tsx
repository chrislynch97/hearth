import { Card, Group, Table, Text, Title } from "@mantine/core";
import { Progress } from "@microcharts/react/progress";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { shareSummary } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import { pct, type Report } from "../model";
import { ExportButton } from "./ExportButton";

export interface CategoryBreakdownCardProps {
    report: Report;
    money: MoneyFormat;
    dp: number;
}

export const CategoryBreakdownCard = ({
    report,
    money,
    dp,
}: CategoryBreakdownCardProps) => {
    const { rows, total } = report.categoryBreakdown;

    const exportCsv = () =>
        downloadCsv("category-breakdown.csv", [
            ["Category", "Spent", "% of spend"],
            ...rows.map((r) => [
                r.name,
                fromMinor(r.spent, dp),
                pct(r.spent, total),
            ]),
        ]);

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>Category breakdown</Title>
                <ExportButton onClick={exportCsv} />
            </Group>
            {rows.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No spending in this period.
                </Text>
            ) : (
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Category</Table.Th>
                            <Table.Th ta="right">Spent</Table.Th>
                            <Table.Th>% of spend</Table.Th>
                            <Table.Th ta="right">% of income</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((r) => (
                            <Table.Tr key={r.categoryId ?? "uncat"}>
                                <Table.Td>{r.name}</Table.Td>
                                <Table.Td ta="right">
                                    {formatMoney(r.spent, money)}
                                </Table.Td>
                                <Table.Td>
                                    <Progress
                                        value={r.spent}
                                        max={Math.max(1, total)}
                                        width={80}
                                        height={14}
                                        title={r.name}
                                        summary={shareSummary(
                                            r.spent,
                                            total,
                                            "spending this period"
                                        )}
                                    />
                                </Table.Td>
                                <Table.Td ta="right" c="dimmed">
                                    {pct(
                                        r.spent,
                                        report.householdMonthlyIncome
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
