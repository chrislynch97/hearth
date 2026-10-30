import { lazy, Suspense } from "react";
import { todayIso } from "@shared/dates";
import { formatMoney } from "@shared/money";
import {
    formatSignedPercent,
    useFormatDate,
    type MoneyFormat,
} from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import type { Raise } from "../model";

const TrendChart = lazy(() =>
    import("@/components/ui/TrendChart").then((m) => ({
        default: m.TrendChart,
    }))
);

export interface SalaryCardProps {
    /** Oldest first. */
    raises: Raise[];
    money: MoneyFormat;
}

/** Where a salary stands, and how far it has come. */
export const SalaryCard = ({ raises, money }: SalaryCardProps) => {
    const formatDate = useFormatDate();

    const first = raises[0];
    const latest = raises.at(-1);
    if (!first || !latest) return null;

    const growth =
        first.newSalary > 0
            ? (latest.newSalary / first.newSalary - 1) * 100
            : null;

    // A step only shows its height once the line runs on past it, so carry the
    // latest salary through to today.
    const today = todayIso();
    const points = [
        ...raises.map((r) => ({ date: r.effectiveDate, value: r.newSalary })),
        ...(latest.effectiveDate < today
            ? [{ date: today, value: latest.newSalary }]
            : []),
    ];

    return (
        <Card>
            <CardContent className="flex flex-col gap-5">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-sm font-medium text-text-muted">
                        Salary
                    </span>
                    <span className="tabular font-display text-fig-xl font-medium leading-none text-text">
                        {formatMoney(latest.newSalary, money)}
                    </span>
                    {raises.length > 1 && growth !== null && (
                        <span className="text-base text-text-muted">
                            <span
                                className={
                                    growth >= 0
                                        ? "text-positive-fg"
                                        : "text-danger"
                                }
                            >
                                {formatSignedPercent(growth)}
                            </span>{" "}
                            since {formatDate(first.effectiveDate)}
                        </span>
                    )}
                </div>
                {raises.length > 1 && (
                    <Suspense fallback={null}>
                        <TrendChart
                            label="Annual salary"
                            curve="stepAfter"
                            points={points}
                            money={money}
                        />
                    </Suspense>
                )}
            </CardContent>
        </Card>
    );
};
