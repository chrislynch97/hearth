import { useState } from "react";
import { todayIso } from "@shared/dates";
import { periodConfig, periodForDate, shiftPeriod } from "@shared/period";
import { trpc } from "@/trpc";
import { useFormatDate, useMoney } from "@/useMoney";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { CategorySpendCard } from "@/features/reports/components/CategorySpendCard";
import { SpendingTrendCard } from "@/features/reports/components/SpendingTrendCard";

// Radix Select can't hold an empty value, so "no filter" needs a stand-in.
const EVERYONE = "everyone";

/** Spending looked at two ways: month to month, and by category for a period. */
export const ReportsPage = () => {
    const money = useMoney();
    const formatDate = useFormatDate();
    const ctx = trpc.bootstrap.context.useQuery();
    const [periodStart, setPeriodStart] = useState<string>();
    const [owner, setOwner] = useState(EVERYONE);
    const [months, setMonths] = useState("6");
    const query = trpc.reports.overview.useQuery({
        ...(periodStart ? { periodStart } : {}),
        ...(owner !== EVERYONE ? { ownerId: owner } : {}),
        months: Number(months),
    });

    const periodCfg = periodConfig(ctx.data?.household ?? 1);
    const report = query.data;
    const current = periodForDate(todayIso(), periodCfg);
    const shown = report?.period ?? current;
    const members = (ctx.data?.members ?? []).filter(
        (m) => m.archivedAt === null
    );

    const shift = (delta: number) =>
        setPeriodStart(shiftPeriod(shown, delta, periodCfg).start);

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Reports"
                actions={
                    <ChoiceField
                        label="Whose spending"
                        hideLabel
                        options={[
                            { value: EVERYONE, label: "Everyone" },
                            ...members.map((m) => ({
                                value: m.id,
                                label: m.displayName,
                            })),
                        ]}
                        value={owner}
                        onChange={setOwner}
                        className="w-full sm:w-44"
                    />
                }
            />
            {query.isLoading && <Spinner label="Loading reports" />}
            {report && (
                <>
                    <SpendingTrendCard
                        totals={report.monthlyTotals}
                        money={money}
                        months={months}
                        onMonths={setMonths}
                    />
                    <CategorySpendCard
                        report={report}
                        money={money}
                        showPlan={owner === EVERYONE}
                        period={{
                            label: `${formatDate(shown.start)} – ${formatDate(shown.end)}`,
                            onPrevious: () => shift(-1),
                            onNext: () => shift(1),
                            isCurrent: shown.start === current.start,
                            onCurrent: () => setPeriodStart(undefined),
                        }}
                    />
                </>
            )}
        </div>
    );
};
