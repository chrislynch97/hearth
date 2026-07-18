import type { MoneyFormat } from "@/useMoney";
import { Card, Title } from "@mantine/core";
import { AreaChart } from "@mantine/charts";
import { chartXAxisProps, hearthTokens } from "@/theme";
import { formatMoney } from "@shared/money";

export interface TrendCardProps {
    timeline: Array<{ date: string; netWorth: number }>;
    money: MoneyFormat;
}

export const TrendCard = ({ timeline, money }: TrendCardProps) => {
    if (timeline.length < 2) return null;
    // YY-MM labels; recharts thins them automatically when there are many points.
    const data = timeline.map((p) => ({
        date: p.date.slice(2, 7),
        netWorth: p.netWorth,
    }));
    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Net worth over time
            </Title>
            <AreaChart
                h={180}
                data={data}
                dataKey="date"
                // Net worth can dip below zero — split the fill so negative stretches
                // read apricot (a liability warning) and positive reads moss.
                type="split"
                splitColors={[
                    hearthTokens.brand.moss,
                    hearthTokens.brand.apricot,
                ]}
                series={[
                    {
                        name: "netWorth",
                        label: "Net worth",
                        color: hearthTokens.brand.moss,
                    },
                ]}
                valueFormatter={(v) => formatMoney(v, money)}
                withDots={false}
                yAxisProps={{ width: 76 }}
                xAxisProps={chartXAxisProps}
                gridAxis="y"
            />
        </Card>
    );
};
