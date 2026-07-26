import { Card, Group, Table, Text, Title } from "@mantine/core";
import { Progress } from "@microcharts/react/progress";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { shareSummary } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import type { Report } from "../model";
import { ExportButton } from "./ExportButton";

export interface PerMemberVsJointCardProps {
    report: Report;
    money: MoneyFormat;
    dp: number;
}

export const PerMemberVsJointCard = ({
    report,
    money,
    dp,
}: PerMemberVsJointCardProps) => {
    const rows = report.perMemberVsJoint;
    // Guard the denominator: a household with no outgoings would make every
    // share 0/0, and Progress renders NaN as an empty track with no label.
    const total = Math.max(
        1,
        rows.reduce((acc, r) => acc + r.monthlyCost, 0)
    );

    const exportCsv = () =>
        downloadCsv("per-member-vs-joint.csv", [
            ["Member", "Type", "Monthly outgoing cost"],
            ...rows.map((r) => [
                r.displayName,
                r.kind,
                fromMinor(r.monthlyCost, dp),
            ]),
        ]);

    return (
        <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
                <Title order={4}>Per-member vs joint</Title>
                <ExportButton onClick={exportCsv} />
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
                Each member's share of the monthly outgoings — the fairness
                lens.
            </Text>
            <Table verticalSpacing="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Member</Table.Th>
                        <Table.Th ta="right">Monthly cost</Table.Th>
                        <Table.Th>Share</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.map((r) => (
                        <Table.Tr key={r.ownerId}>
                            <Table.Td>{r.displayName}</Table.Td>
                            <Table.Td ta="right">
                                {formatMoney(r.monthlyCost, money)}
                            </Table.Td>
                            <Table.Td>
                                <Progress
                                    value={r.monthlyCost}
                                    max={total}
                                    width={80}
                                    height={14}
                                    title={r.displayName}
                                    summary={shareSummary(
                                        r.monthlyCost,
                                        total,
                                        "the household's monthly outgoings"
                                    )}
                                />
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Card>
    );
};
