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

export interface TrendPoint {
    date: string;
    value: number;
}

export interface TrendChartProps {
    label: string;
    points: TrendPoint[];
    money: MoneyFormat;
    /** `stepAfter` for a figure that holds until it changes, like a salary. */
    curve?: "monotone" | "stepAfter";
}

/** A money figure over time, filling a card. Import it behind `React.lazy` so
 *  recharts stays out of the route's chunk (#141). */
export const TrendChart = ({
    label,
    points,
    money,
    curve = "monotone",
}: TrendChartProps) => {
    const formatDate = useFormatDate();

    const config: ChartConfig = {
        value: { label, color: "var(--color-primary)" },
    };
    const dipsNegative = points.some((point) => point.value < 0);

    return (
        <ChartContainer
            config={config}
            className="aspect-auto h-[220px] w-full"
        >
            <AreaChart data={points} margin={{ top: 8, left: 0, right: 0 }}>
                <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stopColor="var(--color-value)"
                            stopOpacity={0.35}
                        />
                        <stop
                            offset="100%"
                            stopColor="var(--color-value)"
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
                    dataKey="value"
                    type={curve}
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    fill="url(#trendFill)"
                />
            </AreaChart>
        </ChartContainer>
    );
};
