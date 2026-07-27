import { useState } from "react";
import {
    Anchor,
    Center,
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { periodForDate, shiftPeriod, periodConfig } from "@shared/period";
import { useMoney } from "@/useMoney";
import { CategoryBreakdownCard } from "@/features/reports/components/CategoryBreakdownCard";
import { MonthlySpendingCard } from "@/features/reports/components/MonthlySpendingCard";
import { MonthOverMonthCard } from "@/features/reports/components/MonthOverMonthCard";
import { PerMemberVsJointCard } from "@/features/reports/components/PerMemberVsJointCard";
import { SpendVsAllocationCard } from "@/features/reports/components/SpendVsAllocationCard";

export function ReportsPage() {
    const money = useMoney();
    const ctx = trpc.bootstrap.context.useQuery();
    const periodCfg = periodConfig(ctx.data?.household ?? 1);
    const members = (ctx.data?.members ?? []).filter(
        (m) => m.archivedAt === null
    );

    const [periodStart, setPeriodStart] = useState<string | undefined>(
        undefined
    );
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [months, setMonths] = useState("6");

    const query = trpc.reports.overview.useQuery({
        ...(periodStart ? { periodStart } : {}),
        ...(ownerId ? { ownerId } : {}),
        months: Number(months),
    });
    const report = query.data;
    const dp = money.decimalPlaces;

    const shift = (delta: number) => {
        const base =
            report?.period ??
            periodForDate(new Date().toISOString().slice(0, 10), periodCfg);
        setPeriodStart(shiftPeriod(base, delta, periodCfg).start);
    };

    return (
        <Stack gap="lg" maw={960} mx="auto">
            <Title order={2}>Reports</Title>

            <Group justify="space-between" align="flex-end" wrap="wrap">
                <Group gap="xs" align="center">
                    <Anchor
                        component="button"
                        type="button"
                        onClick={() => shift(-1)}
                        size="sm"
                    >
                        ‹ Prev
                    </Anchor>
                    <Text size="sm" c="dimmed">
                        {report
                            ? `${report.period.start} – ${report.period.end}`
                            : "…"}
                    </Text>
                    <Anchor
                        component="button"
                        type="button"
                        onClick={() => shift(1)}
                        size="sm"
                    >
                        Next ›
                    </Anchor>
                    {periodStart && (
                        <Anchor
                            component="button"
                            type="button"
                            onClick={() => setPeriodStart(undefined)}
                            size="sm"
                        >
                            This period
                        </Anchor>
                    )}
                </Group>
                <Group gap="sm" align="flex-end">
                    <Select
                        label="Owner"
                        placeholder="Everyone"
                        size="xs"
                        clearable
                        data={members.map((m) => ({
                            value: m.id,
                            label: m.displayName,
                        }))}
                        value={ownerId}
                        onChange={setOwnerId}
                        w={160}
                    />
                    <SegmentedControl
                        size="xs"
                        value={months}
                        onChange={setMonths}
                        data={[
                            { value: "3", label: "3m" },
                            { value: "6", label: "6m" },
                            { value: "12", label: "12m" },
                        ]}
                    />
                </Group>
            </Group>

            {query.isLoading && (
                <Center>
                    <Loader size="sm" />
                </Center>
            )}

            {report && (
                <>
                    <MonthlySpendingCard
                        report={report}
                        money={money}
                        dp={dp}
                    />
                    <SpendVsAllocationCard
                        report={report}
                        money={money}
                        dp={dp}
                    />
                    <CategoryBreakdownCard
                        report={report}
                        money={money}
                        dp={dp}
                    />
                    <PerMemberVsJointCard
                        report={report}
                        money={money}
                        dp={dp}
                    />
                    <MonthOverMonthCard report={report} money={money} dp={dp} />
                </>
            )}
        </Stack>
    );
}
