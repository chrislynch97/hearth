import {
    Badge,
    Card,
    Divider,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from "@mantine/core";
import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import type { PayslipWithLines } from "../../../../server/features/income/payslips.router";

export interface PayslipCardListProps {
    payslips: PayslipWithLines[];
    /** Running and rolling-12m net, keyed by payslip id. */
    derived: Map<string, { running: number; rolling: number }>;
    money: MoneyFormat;
    onEdit: (payslip: PayslipWithLines) => void;
}

/** The payslip history on a phone: a card each, period and net up top where
 *  you're scanning for them, the other four figures as a label/value list.
 *
 *  Six money columns will not fit 390px, and a scroll container just hides
 *  half of them behind a gesture nothing advertises. Tapping a card opens the
 *  editor — which is also where delete lives, since there's no room here for a
 *  × that isn't a mis-tap waiting to happen. */
export const PayslipCardList = ({
    payslips,
    derived,
    money,
    onEdit,
}: PayslipCardListProps) => {
    const fmt = useFormatDate();

    return (
        <Stack gap="sm">
            {payslips.map((p) => {
                const d = derived.get(p.id);
                const heading = p.periodLabel || fmt(p.payDate);
                const figures: Array<[string, number | undefined]> = [
                    ["Gross", p.totals.grossPay],
                    ["Deductions", p.totals.totalDeductions],
                    ["Rolling 12m", d?.rolling],
                    ["Running total", d?.running],
                ];

                return (
                    <UnstyledButton
                        key={p.id}
                        onClick={() => onEdit(p)}
                        aria-label={`Edit payslip ${heading}`}
                        style={{ width: "100%", textAlign: "left" }}
                    >
                        <Card withBorder padding="sm" radius="md">
                            <Group
                                justify="space-between"
                                align="flex-start"
                                gap="sm"
                                wrap="nowrap"
                            >
                                <div style={{ minWidth: 0 }}>
                                    <Text fw={600} truncate>
                                        {heading}
                                    </Text>
                                    {p.periodLabel && (
                                        <Text size="xs" c="dimmed">
                                            {fmt(p.payDate)}
                                        </Text>
                                    )}
                                </div>
                                <Stack gap={2} align="flex-end">
                                    <Text
                                        fw={700}
                                        style={{ whiteSpace: "nowrap" }}
                                    >
                                        {formatMoney(
                                            p.totals.effectiveNet,
                                            money
                                        )}
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
                                </Stack>
                            </Group>
                            <Divider my="xs" />
                            <Stack gap={2}>
                                {figures.map(([label, value]) => (
                                    <Group key={label} justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            {label}
                                        </Text>
                                        <Text size="sm">
                                            {value === undefined
                                                ? "—"
                                                : formatMoney(value, money)}
                                        </Text>
                                    </Group>
                                ))}
                            </Stack>
                        </Card>
                    </UnstyledButton>
                );
            })}
        </Stack>
    );
};
