import { BarChart } from "@mantine/charts";
import { Card, Title } from "@mantine/core";
import { formatMoney } from "@shared/money";
import { chartXAxisProps, hearthTokens } from "@/theme";
import type { MoneyFormat } from "@/useMoney";

export interface IncomeTrendChartProps {
    trend: Array<{ month: string; net: number }>;
    money: MoneyFormat;
}

// The home page's only chart, split into its own file so recharts stays out of
// the home route's chunk (#141) — it loads lazily after the page renders.
export const IncomeTrendChart = ({ trend, money }: IncomeTrendChartProps) => {
    const hasData = trend.some((m) => m.net > 0);
    if (!hasData) return null;
    // Show just the month (MM); 12 consecutive months are each distinct.
    const data = trend.map((m) => ({ month: m.month.slice(5), net: m.net }));

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Net income · last 12 months
            </Title>
            <BarChart
                h={150}
                data={data}
                dataKey="month"
                withYAxis={false}
                series={[
                    {
                        name: "net",
                        label: "Net income",
                        color: hearthTokens.brand.moss,
                    },
                ]}
                valueFormatter={(v) => formatMoney(v, money)}
                xAxisProps={chartXAxisProps}
                gridAxis="none"
            />
        </Card>
    );
};
