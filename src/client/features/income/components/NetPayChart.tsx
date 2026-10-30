import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyCompact } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/shadcn/chart";
import { monthLabel } from "@/features/reports/model";
import type { Payslip } from "../model";

export interface NetPayChartProps {
    /** Oldest first. */
    payslips: Payslip[];
    money: MoneyFormat;
}

const config: ChartConfig = {
    net: { label: "Net pay", color: "var(--color-primary)" },
    netVariable: {
        label: "With variable pay",
        color: "var(--color-attention)",
    },
};

/** One bar per payslip, in its own colour when variable pay lifted that month.
 *  Its own file so recharts stays out of the route's chunk (#141). */
export const NetPayChart = ({ payslips, money }: NetPayChartProps) => {
    const formatDate = useFormatDate();

    // Two stacked series, one always zero, so each bar is a single colour.
    const data = payslips.map((p) => ({
        date: p.payDate,
        net: p.hasVariablePay ? 0 : p.totals.effectiveNet,
        netVariable: p.hasVariablePay ? p.totals.effectiveNet : 0,
    }));
    const anyVariable = payslips.some((p) => p.hasVariablePay);

    return (
        <ChartContainer
            config={config}
            className="aspect-auto h-[240px] w-full"
        >
            <BarChart data={data} margin={{ top: 8, left: 0, right: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval="equidistantPreserveStart"
                    minTickGap={24}
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
                    cursor={{ fill: "var(--color-hover)" }}
                    content={
                        <ChartTooltipContent
                            hideIndicator
                            labelFormatter={(date) => formatDate(String(date))}
                            formatter={(value) =>
                                Number(value) === 0 ? null : (
                                    <span className="tabular font-medium text-text">
                                        {formatMoney(Number(value), money)}
                                    </span>
                                )
                            }
                        />
                    }
                />
                <Bar
                    dataKey="net"
                    stackId="pay"
                    fill="var(--color-net)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                />
                <Bar
                    dataKey="netVariable"
                    stackId="pay"
                    fill="var(--color-netVariable)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                />
                {anyVariable && (
                    <ChartLegend content={<ChartLegendContent />} />
                )}
            </BarChart>
        </ChartContainer>
    );
};
