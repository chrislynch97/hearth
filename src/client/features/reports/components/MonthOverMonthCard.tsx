import { Card, Group, Table, Text, Title } from "@mantine/core";
import { Sparkline } from "@microcharts/react/sparkline";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { moneyFormat } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import { monthLabel, type Report } from "../model";
import { ExportButton } from "./ExportButton";

export interface MonthOverMonthCardProps {
    report: Report;
    money: MoneyFormat;
    dp: number;
}

export const MonthOverMonthCard = ({
    report,
    money,
    dp,
}: MonthOverMonthCardProps) => {
    const { months, rows } = report.monthOverMonth;
    const fmt = moneyFormat(money);

    const exportCsv = () =>
        downloadCsv("month-over-month.csv", [
            ["Category", ...months],
            ...rows.map((r) => [
                r.name,
                ...r.byMonth.map((v) => fromMinor(v, dp)),
            ]),
        ]);

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>Month over month</Title>
                <ExportButton onClick={exportCsv} />
            </Group>
            {rows.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No spending in this window.
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={200 + months.length * 70}>
                    <Table verticalSpacing="xs" horizontalSpacing="sm">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Category</Table.Th>
                                <Table.Th>Trend</Table.Th>
                                {months.map((m) => (
                                    <Table.Th key={m} ta="right">
                                        {m.slice(2)}
                                    </Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {rows.map((r) => (
                                <Table.Tr key={r.categoryId ?? "uncat"}>
                                    <Table.Td>{r.name}</Table.Td>
                                    <Table.Td w={80}>
                                        {/* Each row auto-fits its own y-domain: the
                                            read is "is this category creeping up?",
                                            which a shared scale would flatten away
                                            for everything but the biggest category. */}
                                        <Sparkline
                                            data={r.byMonth}
                                            width={64}
                                            height={18}
                                            fill
                                            format={fmt}
                                            title={`${r.name}, ${monthLabel(months[0] ?? "")} to ${monthLabel(months[months.length - 1] ?? "")}`}
                                        />
                                    </Table.Td>
                                    {r.byMonth.map((v, i) => (
                                        <Table.Td
                                            key={i}
                                            ta="right"
                                            c={v === 0 ? "dimmed" : undefined}
                                        >
                                            {v === 0
                                                ? "—"
                                                : formatMoney(v, money)}
                                        </Table.Td>
                                    ))}
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Card>
    );
};
