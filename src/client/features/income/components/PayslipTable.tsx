import { ActionIcon, Badge, Card, Group, Table, Text } from "@mantine/core";
import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import type { PayslipWithLines } from "../../../../server/features/income/payslips.router";

export interface PayslipTableProps {
    payslips: PayslipWithLines[];
    /** Running and rolling-12m net, keyed by payslip id. */
    derived: Map<string, { running: number; rolling: number }>;
    money: MoneyFormat;
    onEdit: (payslip: PayslipWithLines) => void;
    onDelete: (id: string) => void;
}

/** Every payslip and its cumulative figures, six columns wide. The pointer-sized
 *  view — phones get `PayslipCardList` instead, which is the same numbers without
 *  the sideways scroll. */
export const PayslipTable = ({
    payslips,
    derived,
    money,
    onEdit,
    onDelete,
}: PayslipTableProps) => {
    const fmt = useFormatDate();

    return (
        <Card withBorder padding="md">
            <Table.ScrollContainer minWidth={640}>
                <Table verticalSpacing="xs" horizontalSpacing="md">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th style={{ whiteSpace: "nowrap" }}>
                                Pay date
                            </Table.Th>
                            <Table.Th style={{ textAlign: "right" }}>
                                Gross
                            </Table.Th>
                            <Table.Th style={{ textAlign: "right" }}>
                                Deductions
                            </Table.Th>
                            <Table.Th style={{ textAlign: "right" }}>
                                Net
                            </Table.Th>
                            <Table.Th style={{ textAlign: "right" }}>
                                Rolling 12m
                            </Table.Th>
                            <Table.Th style={{ textAlign: "right" }}>
                                Running total
                            </Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {payslips.map((p) => {
                            const d = derived.get(p.id);
                            return (
                                <Table.Tr key={p.id}>
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <Text
                                                size="sm"
                                                style={{
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {p.periodLabel ||
                                                    fmt(p.payDate)}
                                            </Text>
                                            {p.hasVariablePay && (
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="apricot"
                                                >
                                                    variable
                                                </Badge>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: "right" }}>
                                        {formatMoney(p.totals.grossPay, money)}
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: "right" }}>
                                        {formatMoney(
                                            p.totals.totalDeductions,
                                            money
                                        )}
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: "right" }}>
                                        <Text size="sm" fw={600}>
                                            {formatMoney(
                                                p.totals.effectiveNet,
                                                money
                                            )}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td
                                        style={{ textAlign: "right" }}
                                        c="dimmed"
                                    >
                                        {d
                                            ? formatMoney(d.rolling, money)
                                            : "—"}
                                    </Table.Td>
                                    <Table.Td
                                        style={{ textAlign: "right" }}
                                        c="dimmed"
                                    >
                                        {d
                                            ? formatMoney(d.running, money)
                                            : "—"}
                                    </Table.Td>
                                    <Table.Td>
                                        <Group
                                            gap={4}
                                            justify="flex-end"
                                            wrap="nowrap"
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                size="sm"
                                                aria-label="Edit payslip"
                                                onClick={() => onEdit(p)}
                                            >
                                                ✎
                                            </ActionIcon>
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                aria-label="Delete payslip"
                                                onClick={() => onDelete(p.id)}
                                            >
                                                ×
                                            </ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Card>
    );
};
