import { lazy, Suspense } from "react";
import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { StatRow } from "@/components/ui/StatRow";
import { monthLabel } from "@/features/reports/model";
import type { AccountsSummary } from "../model";

const NetWorthChart = lazy(() =>
    import("./NetWorthChart").then((m) => ({ default: m.NetWorthChart }))
);

export interface NetWorthCardProps {
    summary: AccountsSummary;
    money: MoneyFormat;
}

/** What the household is worth now, what that's made of, and how it got here. */
export const NetWorthCard = ({ summary, money }: NetWorthCardProps) => {
    const { assets, liabilities, netWorth, timeline } = summary;
    const first = timeline[0];
    const change = first ? netWorth - first.netWorth : 0;

    return (
        <Card>
            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-sm font-medium text-text-muted">
                            Net worth
                        </span>
                        <span
                            className={`tabular font-display text-fig-xl font-medium leading-none ${netWorth < 0 ? "text-danger" : "text-text"}`}
                        >
                            {formatMoney(netWorth, money)}
                        </span>
                        {first && timeline.length > 1 && (
                            <span className="text-base text-text-muted">
                                <span
                                    className={
                                        change >= 0
                                            ? "text-positive-fg"
                                            : "text-danger"
                                    }
                                >
                                    {change >= 0 ? "+" : ""}
                                    {formatMoney(change, money)}
                                </span>{" "}
                                since {monthLabel(first.date.slice(0, 7))}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 sm:w-64">
                        <StatRow
                            label="Assets"
                            value={formatMoney(assets, money)}
                        />
                        <StatRow
                            label="Liabilities"
                            value={formatMoney(liabilities, money)}
                        />
                    </div>
                </div>
                {timeline.length > 1 && (
                    <Suspense fallback={null}>
                        <NetWorthChart timeline={timeline} money={money} />
                    </Suspense>
                )}
            </CardContent>
        </Card>
    );
};
