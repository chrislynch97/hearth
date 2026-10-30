import { lazy, Suspense } from "react";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatFigure } from "@/components/ui/StatFigure";
import { monthLabel, type Report } from "../model";
import { ExportButton } from "./ExportButton";

const SpendingTrendChart = lazy(() =>
    import("./SpendingTrendChart").then((m) => ({
        default: m.SpendingTrendChart,
    }))
);

const WINDOWS = [
    { value: "3", label: "3 months" },
    { value: "6", label: "6 months" },
    { value: "12", label: "12 months" },
];

export interface SpendingTrendCardProps {
    totals: Report["monthlyTotals"];
    money: MoneyFormat;
    months: string;
    onMonths: (months: string) => void;
}

/** How spending has moved month to month, over a window you choose. */
export const SpendingTrendCard = ({
    totals,
    money,
    months,
    onMonths,
}: SpendingTrendCardProps) => {
    const { average, highest, lowest, rows } = totals;

    const exportCsv = () =>
        downloadCsv("monthly-spending.csv", [
            ["Month", "Spent", "Transactions", "Change"],
            ...rows.map((r) => [
                r.month,
                fromMinor(r.total, money.decimalPlaces),
                r.count,
                r.change === null
                    ? ""
                    : fromMinor(r.change, money.decimalPlaces),
            ]),
        ]);

    return (
        <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Monthly spending</CardTitle>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <SegmentedControl
                        label="Months to show"
                        options={WINDOWS}
                        value={months}
                        onChange={onMonths}
                        className="w-full sm:w-auto [&>*]:flex-1"
                    />
                    <ExportButton onClick={exportCsv} />
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
                {highest && lowest ? (
                    <>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            <div className="col-span-2 sm:col-span-1">
                                <StatFigure
                                    label="Average"
                                    value={formatMoney(average, money)}
                                    hint="a month"
                                />
                            </div>
                            <StatFigure
                                label="Highest"
                                value={formatMoney(highest.total, money)}
                                hint={monthLabel(highest.month)}
                            />
                            <StatFigure
                                label="Lowest"
                                value={formatMoney(lowest.total, money)}
                                hint={monthLabel(lowest.month)}
                            />
                        </div>
                        <Suspense fallback={null}>
                            <SpendingTrendChart totals={totals} money={money} />
                        </Suspense>
                    </>
                ) : (
                    <p className="text-base text-text-muted">
                        No spending in this window.
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
