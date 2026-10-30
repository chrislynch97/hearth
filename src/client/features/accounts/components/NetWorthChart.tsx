import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/shadcn/chart";
import { monthLabel } from "@/features/reports/model";
import type { AccountsSummary } from "../model";

export interface NetWorthChartProps {
    timeline: AccountsSummary["timeline"];
    money: MoneyFormat;
}

const config: ChartConfig = {
    netWorth: { label: "Net worth", color: "var(--color-primary)" },
};

/** Net worth across every recorded balance. Its own file so recharts stays out
 *  of the route's chunk (#141). */
export const NetWorthChart = ({ timeline, money }: NetWorthChartProps) => {
    const formatDate = useFormatDate();

    const dipsNegative = timeline.some((point) => point.netWorth < 0);

    return (
        <ChartContainer
            config={config}
            className="aspect-auto h-[220px] w-full"
        >
            <AreaChart data={timeline} margin={{ top: 8, left: 0, right: 0 }}>
                <defs>
                    <linearGradient
                        id="netWorthFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                    >
                        <stop
                            offset="0%"
                            stopColor="var(--color-netWorth)"
                            stopOpacity={0.35}
                        />
                        <stop
                            offset="100%"
                            stopColor="var(--color-netWorth)"
                            stopOpacity={0.03}
                        />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval="equidistantPreserveStart"
                    minTickGap={32}
                    tickFormatter={(date: string) =>
                        monthLabel(date.slice(0, 7))
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
                    content={
                        <ChartTooltipContent
                            hideIndicator
                            labelFormatter={(date) => formatDate(String(date))}
                            formatter={(value) => (
                                <span className="tabular font-medium text-text">
                                    {formatMoney(Number(value), money)}
                                </span>
                            )}
                        />
                    }
                />
                {dipsNegative && (
                    <ReferenceLine y={0} stroke="var(--color-text-faint)" />
                )}
                <Area
                    dataKey="netWorth"
                    type="monotone"
                    stroke="var(--color-netWorth)"
                    strokeWidth={2}
                    fill="url(#netWorthFill)"
                />
            </AreaChart>
        </ChartContainer>
    );
};
