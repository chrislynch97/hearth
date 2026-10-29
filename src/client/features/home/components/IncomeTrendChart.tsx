import type { CSSProperties } from "react";
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
import { personColor } from "@/personColor";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/shadcn/chart";
import type { DashboardSummary } from "@/features/home/model";
import { monthLabel } from "@/features/reports/model";

export interface IncomeTrendChartProps {
    trend: DashboardSummary["incomeTrend"];
    earners: DashboardSummary["incomeEarners"];
    money: MoneyFormat;
}

// Series keys are positional (`p0`, `p1`…): they become CSS custom properties,
// and a member id is no business of a stylesheet.
const seriesKey = (i: number) => `p${i}`;

/** Net pay over the last year, each month's bar stacked by whose pay it was.
 *  Its own file so recharts stays out of the home route's chunk (#141). */
export const IncomeTrendChart = ({
    trend,
    earners,
    money,
}: IncomeTrendChartProps) => {
    const paid = trend.filter((m) => m.net > 0);
    const latest = paid.at(-1);
    if (!latest) return null;

    const average = paid.reduce((sum, m) => sum + m.net, 0) / paid.length;
    const versusAverage = average > 0 ? latest.net / average - 1 : 0;

    const config: ChartConfig = Object.fromEntries(
        earners.map((e, i) => [
            seriesKey(i),
            {
                label: e.displayName,
                color: personColor(e.displayName, e.color),
            },
        ])
    );
    const data = trend.map((m) => ({
        month: m.month,
        total: m.net,
        ...Object.fromEntries(
            earners.map((e, i) => [seriesKey(i), m.byOwner[e.id] ?? 0])
        ),
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Net income</CardTitle>
                <CardDescription>Last 12 months, by person</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="tabular font-display text-fig-xl font-medium leading-none">
                        {formatMoney(latest.net, money)}
                    </span>
                    <span className="text-base text-text-muted">
                        in {monthLabel(latest.month)} ·{" "}
                        <span
                            className={
                                versusAverage >= 0
                                    ? "text-positive-fg"
                                    : "text-attention-fg"
                            }
                        >
                            {Math.abs(Math.round(versusAverage * 100))}%{" "}
                            {versusAverage >= 0 ? "above" : "below"}
                        </span>{" "}
                        the {formatMoney(average, money)} average
                    </span>
                </div>
                <ChartContainer
                    config={config}
                    className="aspect-auto h-[240px] w-full"
                >
                    <BarChart
                        data={data}
                        margin={{ top: 8, left: 0, right: 0 }}
                    >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            // "Jul 26" → "Jul": twelve months never repeat.
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
                                    indicator="dot"
                                    labelFormatter={(_, payload) => {
                                        const row = payload[0]?.payload as
                                            (typeof data)[number] | undefined;
                                        return row
                                            ? `${monthLabel(row.month)} · ${formatMoney(row.total, money)}`
                                            : "";
                                    }}
                                    formatter={(value, name) => (
                                        <div className="flex w-full items-center gap-2">
                                            <span
                                                className="size-2 shrink-0 rounded-full bg-(--color-dot)"
                                                style={
                                                    {
                                                        "--color-dot": `var(--color-${String(name)})`,
                                                    } as CSSProperties
                                                }
                                            />
                                            <span className="text-text-muted">
                                                {config[String(name)]?.label}
                                            </span>
                                            <span className="tabular ml-auto font-medium text-text">
                                                {formatMoney(
                                                    Number(value),
                                                    money
                                                )}
                                            </span>
                                        </div>
                                    )}
                                />
                            }
                        />
                        <ReferenceLine
                            y={average}
                            stroke="var(--color-text-faint)"
                            strokeDasharray="4 4"
                        />
                        {earners.map((e, i) => (
                            <Bar
                                key={e.id}
                                dataKey={seriesKey(i)}
                                stackId="income"
                                fill={`var(--color-${seriesKey(i)})`}
                                // Only the top of the stack is rounded.
                                radius={
                                    i === earners.length - 1 ? [4, 4, 0, 0] : 0
                                }
                            >
                                {/* The month just paid in full colour; the
                                    rest step back, so it reads "now vs then". */}
                                {data.map((m) => (
                                    <Cell
                                        key={m.month}
                                        fillOpacity={
                                            m.month === latest.month ? 1 : 0.6
                                        }
                                    />
                                ))}
                            </Bar>
                        ))}
                        {earners.length > 1 && (
                            <ChartLegend content={<ChartLegendContent />} />
                        )}
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
};
