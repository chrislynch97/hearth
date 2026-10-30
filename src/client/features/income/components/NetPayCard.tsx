import { lazy, Suspense, useState } from "react";
import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatFigure } from "@/components/ui/StatFigure";
import { rollingNet, type Payslip } from "../model";

const NetPayChart = lazy(() =>
    import("./NetPayChart").then((m) => ({ default: m.NetPayChart }))
);

const RANGES = [
    { value: "12", label: "1 year" },
    { value: "24", label: "2 years" },
    { value: "60", label: "5 years" },
    { value: "all", label: "All" },
];

export interface NetPayCardProps {
    /** Newest first, and at least one. */
    payslips: Payslip[];
    money: MoneyFormat;
}

/** What the latest payslip brought home, the year around it, and the trend. */
export const NetPayCard = ({ payslips, money }: NetPayCardProps) => {
    const formatDate = useFormatDate();
    const [range, setRange] = useState("24");

    const latest = payslips[0];
    if (!latest) return null;

    const oldestFirst = [...payslips].reverse();
    const total = payslips.reduce((sum, p) => sum + p.totals.effectiveNet, 0);
    // Only offer a range that would hide something.
    const ranges = RANGES.filter(
        (r) => r.value === "all" || Number(r.value) < payslips.length
    );
    const activeRange = ranges.some((r) => r.value === range) ? range : "all";
    const shown =
        activeRange === "all"
            ? oldestFirst
            : oldestFirst.slice(-Number(activeRange));

    return (
        <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Net pay</CardTitle>
                {ranges.length > 1 && (
                    <SegmentedControl
                        label="How far back to show"
                        options={ranges}
                        value={activeRange}
                        onChange={setRange}
                        className="w-full sm:w-auto [&>*]:flex-1"
                    />
                )}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="col-span-2 sm:col-span-1">
                        <StatFigure
                            label="Latest"
                            value={formatMoney(
                                latest.totals.effectiveNet,
                                money
                            )}
                            hint={
                                latest.periodLabel || formatDate(latest.payDate)
                            }
                        />
                    </div>
                    <StatFigure
                        label="Last 12 months"
                        value={formatMoney(
                            rollingNet(payslips, latest.payDate),
                            money
                        )}
                    />
                    <StatFigure
                        label="All recorded"
                        value={formatMoney(total, money)}
                        hint={`${payslips.length} ${payslips.length === 1 ? "payslip" : "payslips"}`}
                    />
                </div>
                {payslips.length > 1 && (
                    <Suspense fallback={null}>
                        <NetPayChart payslips={shown} money={money} />
                    </Suspense>
                )}
            </CardContent>
        </Card>
    );
};
