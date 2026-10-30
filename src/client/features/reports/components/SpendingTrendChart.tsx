import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    XAxis,
    YAxis,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/shadcn/chart";
import { monthLabel, type Report } from "../model";

export interface SpendingTrendChartProps {
    totals: Report["monthlyTotals"];
    money: MoneyFormat;
}

const config: ChartConfig = {
    total: { label: "Spent", color: "var(--color-primary)" },
};

/** Spending per month against the window's average. Its own file so recharts
 *  stays out of the route's chunk (#141). */
export const SpendingTrendChart = ({
    totals,
    money,
}: SpendingTrendChartProps) => {
    const latest = totals.rows.at(-1)?.month;

    return (
        <ChartContainer
            config={config}
            className="aspect-auto h-[220px] w-full"
        >
            <BarChart data={totals.rows} margin={{ top: 8, left: 0, right: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(month: string) =>
                        monthLabel(month).slice(0, 3)
                    }
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(value: number) =>
                        formatMoneyCompact(value, money)
                    }
                />
                <ChartTooltip
                    cursor={{ fill: "var(--color-hover)" }}
                    content={
                        <ChartTooltipContent
                            hideIndicator
                            labelFormatter={(_, payload) => {
                                const row = payload[0]?.payload as
                                    | Report["monthlyTotals"]["rows"][number]
                                    | undefined;
                                return row
                                    ? `${monthLabel(row.month)} · ${row.count} ${row.count === 1 ? "transaction" : "transactions"}`
                                    : "";
                            }}
                            formatter={(value) => (
                                <span className="tabular font-medium text-text">
                                    {formatMoney(Number(value), money)}
                                </span>
                            )}
                        />
                    }
                />
                <ReferenceLine
                    y={totals.average}
                    stroke="var(--color-text-faint)"
                    strokeDasharray="4 4"
                />
                <Bar
                    dataKey="total"
                    fill="var(--color-total)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                >
                    {/* This month in full colour, the rest stepping back. */}
                    {totals.rows.map((row) => (
                        <Cell
                            key={row.month}
                            fillOpacity={row.month === latest ? 1 : 0.6}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ChartContainer>
    );
};
